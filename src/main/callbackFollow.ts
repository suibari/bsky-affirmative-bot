import { CommitCreateEvent } from "@skyware/jetstream";
import { botBiothythmManager, followers, logger } from "..";
import { agent } from "../bsky/agent";
import { follow } from "../bsky/follow";
import { getConcatFollowers } from "../bsky/getConcatFollowers";
import { replyGreets } from "../bsky/replyGreets";
import { isMention, isSpam, getLangStr } from "../bsky/util";
import { db } from "../db";
import retry from 'async-retry';
import { Record as RecordFollow } from '@atproto/api/dist/client/types/app/bsky/graph/follow.js';
import { Record as RecordPost } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";

export async function callbackFollow (event: CommitCreateEvent<"app.bsky.graph.follow">) {
  const did = String(event.did);
  const record = event.commit.record as RecordFollow;

  // bot対象以外を除外
  if (record.subject !== process.env.BSKY_DID) return;

  // --- レースコンディション対策 ---
  // 1. メモリ上のフォロワーリストに即時追加
  const isAlreadyKnown = followers.some(f => f.did === did);
  if (!isAlreadyKnown) {
    try {
      console.log(`[INFO] New follow from ${did}. Optimistically adding to followers list...`);
      const { data: profileDetailed } = await agent.getProfile({ actor: did });
      // ProfileViewDetailedからProfileViewに必要なプロパティを抽出する
      const profile: ProfileView = {
        $type: 'app.bsky.actor.defs#profileView',
        did: profileDetailed.did,
        handle: profileDetailed.handle,
        displayName: profileDetailed.displayName,
        avatar: profileDetailed.avatar,
        viewer: profileDetailed.viewer,
        labels: profileDetailed.labels,
      };
      followers.push(profile); // 投稿が無視されないよう、即座にリストへ追加
      console.log(`[INFO] ${did} was added to followers list. Current count: ${followers.length}`);
    } catch (e) {
      console.error(`[ERROR] Failed to fetch profile for new follower ${did}. They will be added on next full refresh.`, e);
    }
  }

  // 2. 全フォロワーリストの更新をバックグラウンドで実行 (ブロックしない)
  (async () => {
    console.log(`[INFO] Starting background refresh of followers list triggered by ${did}.`);
    try {
      await retry(
        async () => {
          const newFollowers = await getConcatFollowers({ actor: process.env.BSKY_IDENTIFIER! });
          followers.length = 0; // 配列をクリア
          followers.push(...newFollowers); // 最新のリストで再作成
        },
        { 
          retries: 3, 
          onRetry: (err, attempt) => {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[WARN] Background follower refresh attempt ${attempt} failed:`, message)
          }
        }
      );
      console.log("[INFO] Background followers list refresh successful. Current count:", followers.length);
    } catch (e) {
      console.error("[ERROR] Background follower refresh failed after retries.", e);
    }
  })();

  // 3. DBをチェックして、"新規"フォロワーの場合のみ挨拶とフォローバックを行う
  const isExist = await db.selectDb(did, "created_at");
  if (isExist) {
    console.log(`[INFO] ${did} is an existing or re-following user. Skipping follow-back and greet.`);
    return; // 既存フォロワーなので挨拶などは不要
  }

  console.log(`[INFO] Detected a new follower: ${did} !!`);
  logger.addFollower();
  botBiothythmManager.addFollower();

  // フォローと挨拶 (新規フォロワーのみ)
  try {
    await follow(did);
    logger.addBskyRate();

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
        break;
      }
    }

    db.insertDb(did);
  } catch (e) {
    console.error("[ERROR] Failed during follow/greet process:", e);
  }
}
