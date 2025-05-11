import 'dotenv/config';
import { agent, createOrRefreshSession, initAgent } from './bsky/agent.js';
import { parseEmbedPost } from './bsky/parseEmbedPost.js';
import { handleConversation } from './modes/conversation.js';
import { db } from './db/index.js';
import { startWebSocket } from './bsky/jetstream.js';
import { pointRateLimit, TimeLogger } from './util/logger.js';
import { getLangStr, isMention, isSpam } from './bsky/util.js';
import { Record as RecordPost } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { Record as RecordFollow } from '@atproto/api/dist/client/types/app/bsky/graph/follow.js';
import { replyGreets } from './bsky/replyGreets.js';
import { getConcatFollowers } from './bsky/getConcatFollowers.js';
import { ProfileView } from '@atproto/api/dist/client/types/app/bsky/actor/defs.js';
import { CommitCreateEvent } from '@skyware/jetstream';
import { handleU18Register, handleU18Release } from './modes/u18.js';
import { handleFreq } from './modes/frequency.js';
import { handleFortune } from './modes/fortune.js';
import { replyAffermativeWord } from './bsky/replyAffirmativeWord.js';
import { handleAnalyaze } from './modes/analyze.js';
import { handleCheer } from './modes/cheer.js';
import { handleDJ } from './modes/dj.js';

// 起動時処理
(async () => {
  try {
    console.log("[INFO] Initialize AtpAgent...");
    await initAgent();

    db.createDbIfNotExist();

    console.log("[INFO] Fetching followers...");
    followers = await getConcatFollowers({actor: process.env.BSKY_IDENTIFIER!});

    console.log("[INFO] Connecting to JetStream...");
    await startWebSocket(doReply, doFollowAndGreet);
  } catch (error) {
    console.error("[ERROR] Failed to update followers and start WebSocket:", error);
  }
})();
// global.fetch = require('node-fetch'); // for less than node-v17

const SPAN_FOLLOW_CHECK = 2 * 60 * 1000; // 2min
const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)
const MINUTES_THRD_RESPONSE = 10 * 60 * 1000; // 10min
const THRD_FOLLOW_BY_FOLLOWER = 2.5;
let followers: ProfileView[] = [];

// followイベントコールバック
// * フォロー通知があったら以下を行う
//   - フォロー済みか判定
//   - フォロー済みでなければ、以下を実行
//     * その人をフォローバック
//     * その人にあいさつポスト
async function doFollowAndGreet(event: CommitCreateEvent<"app.bsky.graph.follow">) {
  try {
    const did = String(event.did);
    const record = event.commit.record as RecordFollow;

    // bot対象以外を除外
    if (record.subject !== process.env.BSKY_DID) return;

    // DB登録済みは除外
    const isExist = await db.selectDb(did, "created_at");
    if (isExist) return;

    console.log(`[INFO] detect new follower: ${did} !!`);
    await agent.follow(did);
    pointRateLimit.addCreate();

    const response = await agent.getAuthorFeed({actor: did, filter: 'posts_no_replies'});
    for (const feed of response.data.feed) {
      if (
        (isMention(feed.post.record as RecordPost) !== null) &&
        (!feed.reason) &&
        (!isSpam(feed.post))
      ) {
        const langStr = getLangStr((feed.post.record as RecordPost).langs);
        await replyGreets(feed.post, langStr);
        pointRateLimit.addCreate();

        break;
      }
    }
    db.insertDb(did);

    console.log("[INFO] Re-fetching followers...");
    followers = await getConcatFollowers({actor: process.env.BSKY_IDENTIFIER!});
  } catch(e) {
    console.error(e);
  }
}

// postイベントコールバック
// * コールバック関数仕様
//   - 前回反応日時をDBから取得
//   - 条件でフィルタリング
//   - 前回反応日時から5分経過していたら反応
//   - 全肯定リプライ
async function doReply(event: CommitCreateEvent<"app.bsky.feed.post">) {
  try {
    const did = event.did;
    const record = event.commit.record as RecordPost;

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
    // 定型文モード解除
    const isReleaseU18 = await handleU18Release(event)
    if (isReleaseU18) return;
    
    // 定型文モード
    const isRegisterU18 = await handleU18Register(event)
    if (isRegisterU18) return;

    // リプ頻度調整モード
    const isRegisterFreq = await handleFreq(event, follower);
    if (isRegisterFreq) return;

    // 占いモード
    const isUranai = await handleFortune(event, follower);
    if (isUranai) return;

    // 分析モード
    const isAnalyze = await handleAnalyaze(event, follower);
    if (isAnalyze) return;

    // 応援モード
    const isCheer = await handleCheer(event, follower);
    if (isCheer) return;

    // 応援モード
    const isDJ = await handleDJ(event, follower);
    if (isDJ) return;

    // 会話モード
    const isConversation = await handleConversation(event, follower);
    if (isConversation) return;

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

// 1時間おきにセッション確認、Rate Limit Pointを出力
setInterval(async () => {
  await createOrRefreshSession()
  
  const currentPoint = pointRateLimit.getPoint();
  console.log(`[INFO] rate limit point is ${currentPoint} on this hour.`);
  pointRateLimit.initPoint();
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

function isJudgeByFreq(probability: number) {
  if (probability < 0 || probability > 100) {
    throw new Error("Probability must be between 0 and 100.");
  }

  return Math.random() * 100 < probability;
}
