import { AppBskyFeedDefs } from "@atproto/api";
type FeedViewPost = AppBskyFeedDefs.FeedViewPost;
import { agent } from "../agent.js";

/**
 * 指定ユーザーの投稿（リポスト除く）を最大 desiredCount 件取得する。
 * public な author feed なのでユーザー認可は不要（bot agent で読める）。
 */
export async function getConcatAuthorFeed(
  did: string,
  desiredCount: number,
): Promise<FeedViewPost[]> {
  let feeds: FeedViewPost[] = [];
  let cursor: string | undefined = undefined;

  while (feeds.length < desiredCount) {
    const response = await agent.getAuthorFeed({
      actor: did,
      limit: 100,
      filter: "posts_with_replies",
      cursor,
    });

    const feed = response.data.feed;
    feeds = feeds.concat(feed.filter((item) => !item.reason)); // リポスト除外

    if (!response.data.cursor || feed.length === 0) break;
    cursor = response.data.cursor;
  }

  return feeds.slice(0, desiredCount);
}
