import 'dotenv/config';
import { agent, createOrRefreshSession, initAgent } from './bsky/agent.js';
import { parseEmbedPost } from './bsky/parseEmbedPost.js';
import { handleConversation } from './modes/conversation.js';
import { db } from './db/index.js';
import { startWebSocket } from './bsky/jetstream.js';
import { pointRateLimit, TimeLogger } from './util/logger.js';
import { listUnreadNotifications } from './bsky/listUnreadNotifications.js';
import { getLangStr, isMention, isSpam } from './bsky/util.js';
import { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { replyGreets } from './bsky/replyGreets.js';
import { getConcatFollowers } from './bsky/getConcatFollowers.js';
import { ProfileView } from '@atproto/api/dist/client/types/app/bsky/actor/defs.js';
import { CommitCreateEvent } from '@skyware/jetstream';
import { handleU18Register, handleU18Release } from './modes/u18.js';
import { handleFreq } from './modes/frequency.js';
import { handleFortune } from './modes/fortune.js';
import { replyAffermativeWord } from './bsky/replyAffirmativeWord.js';
import { handleAnalyaze } from './modes/analyze.js';

// 起動時処理
(async () => {
  await initAgent();
  db.createDbIfNotExist();
})();
// global.fetch = require('node-fetch'); // for less than node-v17

const SPAN_FOLLOW_CHECK = 2 * 60 * 1000; // 2min
const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)
const MINUTES_THRD_RESPONSE = 10 * 60 * 1000; // 10min
const THRD_FOLLOW_BY_FOLLOWER = 2.5;
let followers: ProfileView[] = [];

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

    await createOrRefreshSession();
    const notifications = await listUnreadNotifications({limit: 100});
    for (let notification of notifications) {
      if (notification.reason == 'follow') {
        const did = notification.author.did;
        const isExist = await db.selectDb(did, "updated_at");
        if (!isExist) {
          console.log(`[INFO] detect new follower: ${did} !!`);
          await agent.follow(did);
          pointRateLimit.addCreate();
          
          const response = await agent.getAuthorFeed({actor: did, filter: 'posts_no_replies'});
          for (const feed of response.data.feed) {
            if (
              (notification.author.did === feed.post.author.did) &&
              (isMention(feed.post.record as Record) !== null) &&
              (!feed.reason) &&
              (!isSpam(feed.post))
            ) {
                const langStr = getLangStr((feed.post.record as Record).langs);
                await replyGreets(feed.post, langStr);
                pointRateLimit.addCreate();

                break;
              }
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
  setInterval(doFollowAndGreetIfFollowed, SPAN_FOLLOW_CHECK);
}

// 定期実行タスク2
// * 現在のフォロワー全員のDIDを取得
//   - JetStreamにDIDで接続
//   - message受信時にコールバック関数を実行
async function updateFollowersAndStartWS() {
  try {
    console.log("[INFO] Starting session refresh...");
    await createOrRefreshSession();

    console.log("[INFO] Fetching followers...");
    followers = await getConcatFollowers({actor: process.env.BSKY_IDENTIFIER!}, 10000);

    console.log("[INFO] Connecting to JetStream...");
    startWebSocket(doReply);
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
async function doReply(event: CommitCreateEvent<"app.bsky.feed.post">) {
  try {
    const did = event.did;
    const record = event.commit.record as Record;

    // ==============
    // follower filter
    // ==============
    // 対象フォロワーの情報を取得
    const follower = followers.find(follower => follower.did === did);
    if (!follower) {
      // フォロワーではないポストなので無視
      // console.warn(`[WARNING] No follower found for DID: ${did}`);
      return;
    }

    // ==============
    // spam filter
    // ==============
    const text = record.text;
    const donate_word = ["donate", "donation", "donating", "gofund.me", "paypal.me"];
    // check text
    const isIncludedDonate = donate_word.some(elem => 
      text.toLowerCase().includes(elem.toLowerCase())
    );
    if (isIncludedDonate) {
      return;
    }
    // parse embed
    if (record.embed) {
      const {text_embed, uri_embed, image_embed} = await parseEmbedPost(record);
      // check embed text
      const isIncludedDonateQuote = 
        donate_word.some(elem => 
          text_embed?.toLowerCase().includes(elem.toLowerCase())
        ) || 
        donate_word.some(elem =>
          uri_embed?.toLowerCase().includes(elem.toLowerCase())
        );
      if (isIncludedDonateQuote) {
        return;
      }
    }
    // check label
    const labelsForbidden = ["spam"];
    const {data} = await agent.getProfile({actor: did});
    if (data.labels) {
      for (const label of data.labels) {
        if (labelsForbidden.some(elem => elem === label.val)) {
          return;
        }
      }
    }

    // ==============
    // detect mode
    // ==============
    // 定型文モード
    const isRegisterU18 = await handleU18Register(event)
    if (isRegisterU18) {
      return;
    }

    // 定型文モード解除
    const isReleaseU18 = await handleU18Release(event)
    if (isReleaseU18) {
      return;
    }

    // リプ頻度調整モード
    const isRegisterFreq = await handleFreq(event, follower);
    if (isRegisterFreq) {
      return;
    }

    // 占いモード
    const isUranai = await handleFortune(event, follower);
    if (isUranai) {
      return;
    }

    // 分析モード
    const isAnalyze = await handleAnalyaze(event, follower);
    if (isAnalyze) {
      return;
    }

    // 会話モード
    const isConversation = await handleConversation(event, follower);
    if (isConversation) {
      return;
    }

    // ==============
    // main
    // ==============
    // フィルタリング: リプライでない、かつメンションでない投稿を対象とする
    if (!record.reply && !isMention(record)) {

      // 前回反応日時の取得
      const postedAt = new Date(record.createdAt);
      const updatedAt = new Date(String(await db.selectDb(did, "updated_at")));
      const updatedAtJst = new Date(updatedAt.getTime() + OFFSET_UTC_TO_JST);

      // 時間判定
      const isPast = (postedAt.getTime() - updatedAtJst.getTime() > MINUTES_THRD_RESPONSE);

      // 確立判定
      const user_freq = await db.selectDb(did, "reply_freq");
      const isValidFreq = isJudgeByFreq(user_freq !== null ? Number(user_freq) : 100); // フォロワーだがレコードにないユーザーであるため、通過させる

      if (isPast && isValidFreq) {
        try {
          // U18情報をDBから取得
          const is_u18 = Number(await db.selectDb(did, "is_u18"));

          // 新しい投稿の検出とリプライ処理
          console.log(`[INFO][${did}] New post !!`);
          await replyAffermativeWord(follower, event, is_u18 === 1);

          // DB更新
          db.insertOrUpdateDb(did);
        } catch (replyError) {
          console.error(`[ERROR][${did}] Failed to reply or update DB:`, replyError);
        }
      } else {
        console.log(`[INFO][${did}] Ignored post, past:${isPast}/freq:${isValidFreq}`);
      }
    } else {
      console.log(`[INFO][${did}] Ignored post, reply or mention`);
    }
  } catch (eventError) {
    console.error(`[ERROR] Failed to process incoming event:`, eventError);
  }
}

// 1時間おきにRate Limit Pointを出力
// setInterval(() => {
//   const currentPoint = point.getPoint();
//   console.log(`[INFO] rate limit point is ${currentPoint} on this hour.`);
//   point.initPoint();
// }, 60 * 60 * 1000); // 1 hour

// アプリケーションの終了時にデータベース接続を閉じる
process.on('exit', async () => {
  db.closeDb();
});

// Ctrl+Cなどでアプリケーションを終了する場合もデータベース接続を閉じる
process.on('SIGINT', async () => {
  db.closeDb();
  process.exit();
});

function isJudgeByFreq(probability: number) {
  if (probability < 0 || probability > 100) {
    throw new Error("Probability must be between 0 and 100.");
  }

  return Math.random() * 100 < probability;
}
