import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { agent } from "./agent";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";


/**
 * 指定したユーザーの投稿（リポスト除く）を合計desiredCount件取得する
 * @param did - 取得対象ユーザーのDID
 * @param desiredCount - 最終的に取得したい投稿件数
 * @returns 
 */
export async function getConcatAuthorFeed(
  did: string,
  desiredCount: number
): Promise<FeedViewPost[]> {
  let feeds: FeedViewPost[] = [];
  let cursor: string | undefined = undefined;

  while (feeds.length < desiredCount) {
    const response = await agent.getAuthorFeed({
      actor: did,
      limit: 100,
      filter: 'posts_with_replies',
      cursor,
    });

    const feed = response.data.feed;

    // リポストを除外
    const newFeeds = feed.filter(item => !item.reason)
    feeds = feeds.concat(newFeeds);

    if (!response.data.cursor || feed.length === 0) break;

    cursor = response.data.cursor;
  }

  return feeds.slice(0, desiredCount); // 必要件数に切り詰め
}
