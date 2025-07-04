import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { agent } from "../bsky/agent"; // 適宜パスを調整
import { AppBskyFeedGetAuthorFeed } from "@atproto/api";

/**
 * 指定actorの過去24時間以内の投稿をすべて取得する
 * @param {string} actor - 取得対象のアクター（DIDまたはhandle）
 * @returns {Promise<FeedViewPost[] | null>} - 24時間以内の投稿リスト。ブロックされていれば null。
 */
export async function getTodaysAuthorFeed(actor: string): Promise<FeedViewPost[] | null> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  let cursor: string | undefined = undefined;
  let allPosts: FeedViewPost[] = [];

  try {
    while (true) {
      const res = await agent.app.bsky.feed.getAuthorFeed({
        actor,
        cursor,
        limit: 100,
      });

      const feed = res.data.feed;
      if (!feed || feed.length === 0) break;

      for (const post of feed) {
        if (post.reason) continue; // リポスト除外

        const postDate = new Date(post.post.indexedAt);
        if (postDate >= dayAgo) {
          allPosts.push(post);
        } else {
          return allPosts;
        }
      }

      if (res.data.cursor) {
        cursor = res.data.cursor;
      } else {
        break;
      }
    }
  } catch (e) {
    if (e instanceof AppBskyFeedGetAuthorFeed.BlockedByActorError) {
      console.warn(`[WARN] Blocked by actor "${actor}". Skipping feed.`);
      throw e
    }
    console.error(`[ERROR] Failed to fetch author feed for "${actor}":`, e);
    throw e
  }

  return allPosts;
}
