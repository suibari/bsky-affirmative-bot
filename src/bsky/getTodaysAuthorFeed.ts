import { agent } from './agent.js';
import { FeedViewPost } from '@atproto/api/dist/client/types/app/bsky/feed/defs';

/**
 * 指定actorの過去24時間以内の投稿をすべて取得する
 * @param {string} actor - 取得対象のアクター（DIDまたはhandle）
 * @returns {Promise<FeedViewPost[]>} - 24時間以内の投稿リスト
 */
export async function getTodaysAuthorFeed(actor: string): Promise<FeedViewPost[]> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  let cursor: string | undefined = undefined;
  let allPosts: FeedViewPost[] = [];

  while (true) {
    const res = await agent.app.bsky.feed.getAuthorFeed({
      actor,
      cursor,
      limit: 100,
    });

    const feed = res.data.feed;
    if (!feed || feed.length === 0) break;

    for (const post of feed) {
      // リポストは除外
      if (post.reason) continue;

      // 日時チェック
      const postDate = new Date(post.post.indexedAt);
      if (postDate >= dayAgo) {
        allPosts.push(post);
      } else {
        // これ以降はすべて古いはずなので中断
        return allPosts;
      }
    }

    // 次のページがあるなら続行
    if (res.data.cursor) {
      cursor = res.data.cursor;
    } else {
      break;
    }
  }

  return allPosts;
}
