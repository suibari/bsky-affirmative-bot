require('dotenv').config();
const agent = require('./src/bluesky');
const db = require('./src/database');
const { startWebSocket } = require('./src/jetstream');
const { TimeLogger, point } = require('./src/logger');
const handleU18Registration = require('./src/u18mode');
const handleUranai = require('./src/uranai');
(async () => {
  await db.createDbIfNotExist();
})();
global.fetch = require('node-fetch'); // for less than node-v17

const SPAN_FOLLOW_CHECK = 30 * 60 * 1000;
const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)
const MINUTES_THRD_RESPONSE = 10 * 60 * 1000; // 10min
let followers = [];

// 定期実行タスク1
// * フォロー通知があったら以下を行う
//   - フォロー済みか判定
//   - フォロー済みでなければ、以下を実行
//     * その人をフォローバック
//     * その人にあいさつポスト
async function doFollowAndGreetIfFollowed() {
  try {
    let isFollowedNewly = false;

    console.log(`[INFO] start follow check.`);
    const timer = new TimeLogger();
    timer.tic();

    await agent.createOrRefleshSession(process.env.BSKY_IDENTIFIER, process.env.BSKY_APP_PASSWORD);
    const notifications = await agent.listUnreadNotifications();
    for (let notification of notifications) {
      if (notification.reason == 'follow') {
        const did = notification.author.did;
        const isExist = await db.selectDb(did, "updated_at");
        if (!isExist) {
          console.log(`[INFO] detect new follower: ${did} !!`);
          await agent.follow(did);
          point.addCreate();
          
          const response = await agent.getAuthorFeed({actor: did, filter: 'posts_no_replies'});
          const latestFeed = agent.getLatestFeedWithoutConditions(notification.author, response.data.feed);
          if (latestFeed) {
            await agent.replyGreets(latestFeed.post);
            point.addCreate();
          }

          db.insertDb(did);
        };

        isFollowedNewly = true;
      };
    };
    await agent.updateSeenNotifications(new Date().toISOString());

    if (isFollowedNewly) {
      // フォロワーが増えたのでwebsocket再接続
      updateFollowersAndStartWS();
    }

    // db.closeDb();
    const elapsedTime = timer.tac();
    console.log(`[INFO] finish follow check, elapsed time is ${elapsedTime} [sec].`);

  } catch(e) {
    console.error(e);
  }
}
if (process.env.NODE_ENV === "production") {
  setInterval(doFollowAndGreetIfFollowed, SPAN_FOLLOW_CHECK); // 5 minutes
}

// 定期実行タスク2
// * 現在のフォロワー全員のDIDを取得
//   - JetStreamにDIDで接続
//   - message受信時にコールバック関数を実行
async function updateFollowersAndStartWS() {
  try {
    console.log("[INFO] Starting session refresh...");
    await agent.createOrRefleshSession(process.env.BSKY_IDENTIFIER, process.env.BSKY_APP_PASSWORD);

    console.log("[INFO] Fetching followers...");
    followers = await agent.getConcatFollowers(process.env.BSKY_IDENTIFIER, 10000);
    const didArray = followers.map(follower => follower.did);

    console.log("[INFO] Connecting to JetStream...");
    startWebSocket(arrayShuffle(didArray), doReply);
  } catch (error) {
    console.error("[ERROR] Failed to update followers and start WebSocket:", error);
  }
}
updateFollowersAndStartWS();

// 定期実行タスク2
// * コールバック関数仕様
//   - 前回反応日時をDBから取得
//   - 条件でフィルタリング
//   - 前回反応日時から5分経過していたら反応
//   - 全肯定リプライ
async function doReply(event) {
  try {
    const did = event.did;

    // ==============
    // preprocess
    // ==============
    // 対象フォロワーの情報を取得
    const follower = followers.find(follower => follower.did === did);
    if (!follower) {
      // フォロワーではないポストなので無視
      // console.warn(`[WARNING] No follower found for DID: ${did}`);
      return;
    }
    const displayName = follower.displayName;

    // 定型文モード
    const isRegisterU18 = await handleU18Registration(event);
    if (isRegisterU18) {
      return;
    }

    // 占いモード
    const isUranai = await handleUranai(event, displayName);
    if (isUranai) {
      return;
    }

    // ==============
    // main
    // ==============
    // フィルタリング: リプライでない、かつメンションでない投稿を対象とする
    const record = event.commit.record;
    if (!agent.isReply(record) && !agent.isMention(record)) {

      // 前回反応日時の取得
      const postedAt = new Date(event.commit.record.createdAt);
      const updatedAt = new Date(await db.selectDb(did, "updated_at"));
      const updatedAtJst = new Date(updatedAt.getTime() + OFFSET_UTC_TO_JST);

      // 時間判定
      const isPast = (postedAt.getTime() - updatedAtJst.getTime() > MINUTES_THRD_RESPONSE);
      if (isPast) {
        try {
          // U18情報をDBから取得
          const is_u18 = await db.selectDb(did, "is_u18");

          // 新しい投稿の検出とリプライ処理
          console.log(`[INFO] New post detected: ${did} !!`);
          await agent.replyAffermativeWord(displayName, event, is_u18);
          point.addCreate();

          // DB更新
          db.insertOrUpdateDb(did);
        } catch (replyError) {
          console.error(`[ERROR] Failed to reply or update DB for DID: ${did}`, replyError);
        }
      }
    } else {
      console.log(`[INFO] Post will be ignored for DID: ${did}`);
    }
  } catch (eventError) {
    console.error("[ERROR] Failed to process incoming event:", eventError);
  }
}

// 1時間おきにRate Limit Pointを出力
setInterval(() => {
  const currentPoint = point.getPoint();
  console.log(`[INFO] rate limit point is ${currentPoint} on this hour.`);
  point.initPoint();
}, 60 * 60 * 1000); // 1 hour

// アプリケーションの終了時にデータベース接続を閉じる
process.on('exit', async () => {
  db.closeDb();
});

// Ctrl+Cなどでアプリケーションを終了する場合もデータベース接続を閉じる
process.on('SIGINT', async () => {
  db.closeDb();
  process.exit();
});

function arrayShuffle(array) {
  for(let i = (array.length - 1); 0 < i; i--){

    // 0〜(i+1)の範囲で値を取得
    let r = Math.floor(Math.random() * (i + 1));

    // 要素の並び替えを実行
    let tmp = array[i];
    array[i] = array[r];
    array[r] = tmp;
  }
  return array;
}
