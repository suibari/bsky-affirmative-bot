import 'dotenv/config';
import { agent, createOrRefreshSession, initAgent } from './bsky/agent.js';
import { parseEmbedPost } from './bsky/parseEmbedPost.js';
import { handleConversation } from './modes/conversation.js';
import { db, dbLikes, dbPosts } from './db/index.js';
import { startWebSocket } from './bsky/jetstream.js';
import { pointRateLimit, TimeLogger } from './util/logger.js';
import { getLangStr, isMention, isSpam, splitUri } from './bsky/util.js';
import { Record as RecordPost } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { Record as RecordFollow } from '@atproto/api/dist/client/types/app/bsky/graph/follow.js';
import { Record as RecordLike } from '@atproto/api/dist/client/types/app/bsky/feed/like.js';
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
import retry from 'async-retry';
import { follow } from './bsky/follow.js';
import { whimsicalPostGen } from './gemini/generateWhimsicalPost.js';
import { postContinuous } from './bsky/postContinuous.js';
import { botBiothythmManager } from './biorhythm/index.js';
import { callbackPost } from './main/callbackPost.js';

export let followers: ProfileView[] = [];

// 起動時処理
(async () => {
  try {
    console.log("[INFO] Initialize AtpAgent...");
    await initAgent();

    console.log("[INFO] Fetching followers...");
    followers = await getConcatFollowers({actor: process.env.BSKY_IDENTIFIER!, limit: 100});

    console.log("[INFO] Connecting to JetStream...");
    await startWebSocket(callbackPost, doFollowAndGreet, saveLike);
  } catch (error) {
    console.error("[ERROR] Failed to update followers and start WebSocket:", error);
  }
})();
// global.fetch = require('node-fetch'); // for less than node-v17

// followイベントコールバック
// * フォロー通知があったら以下を行う
//   - フォロー済みか判定
//   - フォロー済みでなければ、以下を実行
//     * その人をフォローバック
//     * その人にあいさつポスト
async function doFollowAndGreet(event: CommitCreateEvent<"app.bsky.graph.follow">) {
  const did = String(event.did);
  const record = event.commit.record as RecordFollow;

  // bot対象以外を除外
  if (record.subject !== process.env.BSKY_DID) return;

  // DB登録済みは除外
  const isExist = await db.selectDb(did, "created_at");
  if (isExist) return;

  console.log(`[INFO] detect new follower: ${did} !!`);
  botBiothythmManager.addFollower();

  // 1. followers更新をawaitで確実に待つ
  try {
    await retry(
      async () => {
        console.log("[INFO] Re-fetching followers...");
        const newFollowers = await getConcatFollowers({ actor: process.env.BSKY_IDENTIFIER! });
        followers.length = 0;
        followers.push(...newFollowers);
      },
      {
        retries: 5,
        onRetry: (err, attempt) => {
          console.warn(`[WARN] Retry attempt ${attempt} to refresh followers failed:`, err);
        },
      }
    );
    console.log("[INFO] Followers updated:", followers.length);
  } catch (e) {
    console.error("[ERROR] Failed to refresh followers after retries:", e);
    return; // followersが更新できなかったら後続を中止
  }

  // 2. フォローと挨拶
  try {
    await follow(did);
    pointRateLimit.addCreate();

    const response = await agent.getAuthorFeed({ actor: did, filter: 'posts_no_replies' });
    for (const feed of response.data.feed) {
      if (
        (isMention(feed.post.record as RecordPost) !== null) &&
        (!feed.reason) &&
        (!isSpam(feed.post))
      ) {
        const langStr = getLangStr((feed.post.record as RecordPost).langs);
        await replyGreets(feed.post, langStr);
        console.log(`[INFO] replied greet: ${did}`);
        pointRateLimit.addCreate();
        break;
      }
    }

    db.insertDb(did);
  } catch (e) {
    console.error("[ERROR] Failed during follow/greet process:", e);
  }
}

// likeイベントコールバック
// * コールバック関数仕様
//   - did, textをDBに格納
async function saveLike (event: CommitCreateEvent<"app.bsky.feed.like">) {
  const did = String(event.did);
  const record = event.commit.record as RecordLike;
  const {did: subjectDid, nsid, rkey} = splitUri(record.subject.uri);

  try {
    retry(
      async () => {
        // 自分宛以外のlikeを除外
        if (subjectDid !== process.env.BSKY_DID) return;
          
        console.log(`[INFO] detect liked by: ${did}`);

        // likeされた元ポストの取得
        const response = await agent.com.atproto.repo.getRecord({
          repo: subjectDid,
          collection: nsid,
          rkey,
        });
        const text = (response.data.value as RecordPost).text;

        // BioRhythm操作
        botBiothythmManager.addLike();

        // DB格納
        dbLikes.insertDb(did);
        dbLikes.updateDb(did, "liked_post", text);
      },{
        retries: 3,
        onRetry: (err, attempt) => {
          console.warn(`[WARN] Retry attempt ${attempt} to saveLike:`, err);
        }
      }
    )
  } catch (e) {
    console.error(`[ERROR][${did}] like process failed: ${e}`);
  }
}

export async function doWhimsicalPost () {
  // スコアTOPのfollowerを取得
  const row = await dbPosts.getHighestScore();

  let did: string;
  let post: string | undefined;
  let topFollower: ProfileView | undefined;
  if (row) {
    did = row.did;
    post = row.post;
    topFollower = (await agent.getProfile({actor: did})).data as ProfileView;
  }
  
  // ポスト
  const text_bot = await whimsicalPostGen.generate({
    topFollower: topFollower ?? undefined,
    topPost: post,
    langStr: "日本語",
    currentMood: botBiothythmManager.getMood,
  });
  await postContinuous(text_bot);
  const text_bot_en = await whimsicalPostGen.generate({
    topFollower: topFollower ?? undefined,
    topPost: post,
    langStr: "英語",
    currentMood: botBiothythmManager.getMood,
  });
  await postContinuous(text_bot_en);

  // テーブルクリア
  dbPosts.clearAllRows();
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
