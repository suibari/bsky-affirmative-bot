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

export async function callbackFollow (event: CommitCreateEvent<"app.bsky.graph.follow">) {
  const did = String(event.did);
  const record = event.commit.record as RecordFollow;

  // bot対象以外を除外
  if (record.subject !== process.env.BSKY_DID) return;

  // DB登録済みは除外
  const isExist = await db.selectDb(did, "created_at");
  if (isExist) return;

  console.log(`[INFO] detect new follower: ${did} !!`);
  logger.addFollower();
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
          console.warn(`[WARN][${event.did}] Retry attempt ${attempt} to refresh followers failed:`, err);
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
