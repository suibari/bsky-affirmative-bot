import { agent } from './agent.js';
import { PostView } from '@atproto/api/dist/client/types/app/bsky/feed/defs';

/**
 * 投稿 URI の配列を 25 件ずつ分割して、全ての投稿を取得する
 * @param {string[]} uris - 投稿 URI の配列
 * @returns {Promise<FeedViewPost[]>} - 投稿情報の配列
 */
export async function getConcatPosts(uris: string[]): Promise<PostView[]> {
  const allPosts: PostView[] = [];

  // 25 件ずつ処理
  for (let i = 0; i < uris.length; i += 25) {
    const chunk = uris.slice(i, i + 25);

    try {
      const response = await agent.getPosts({ uris: chunk });
      allPosts.push(...response.data.posts);
    } catch (error) {
      console.error(`Failed to fetch posts for chunk starting at index ${i}:`, error);
      // 必要に応じて continue か throw を選ぶ
    }
  }

  return allPosts;
}
