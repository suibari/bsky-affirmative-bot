require('dotenv').config();
const MyBlueskyer = require('./src/bluesky');
const SQLite3 = require('./src/database');
const { startWebSocket } = require('./src/jetstream');
const { TimeLogger, PointLogger } = require('./src/logger');
const point = new PointLogger();
const agent = new MyBlueskyer();
const db = new SQLite3();
(async () => {
  await db.createDbIfNotExist();
})();
global.fetch = require('node-fetch'); // for less than node-v17

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
        const isExist = await db.selectDb(did);
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

          await db.insertDb(did);
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
  setInterval(doFollowAndGreetIfFollowed, 5 * 60 * 1000); // 5 minutes
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

    console.log("[INFO] Connecting to JetStream with shuffled DID array...");
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

    // 対象フォロワーの情報を取得
    const follower = followers.find(follower => follower.did === did);
    if (!follower) {
      // フォロワーではないポストなので無視
      // console.warn(`[WARNING] No follower found for DID: ${did}`);
      return;
    }

    const displayName = follower.displayName;

    // フィルタリング: リプライでない、かつメンションでない投稿を対象とする
    const record = event.commit.record;
    if (agent.isNotReply(record) && agent.isNotMention(record)) {
      // 前回反応日時の取得
      const postedAt = new Date(event.commit.record.createdAt);
      const updatedAt = new Date(await db.selectDb(did));
      const updatedAtJst = new Date(updatedAt.getTime() + OFFSET_UTC_TO_JST);

      // 時間判定: 5分以上経過したか
      const isPast = (postedAt.getTime() - updatedAtJst.getTime() > MINUTES_THRD_RESPONSE);
      if (isPast) {
        try {
          // 新しい投稿の検出とリプライ処理
          console.log(`[INFO] New post detected: ${did} !!`);
          await agent.replyAffermativeWord(displayName, event);
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
  await db.closeDb();
});

// Ctrl+Cなどでアプリケーションを終了する場合もデータベース接続を閉じる
process.on('SIGINT', async () => {
  await db.closeDb();
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
