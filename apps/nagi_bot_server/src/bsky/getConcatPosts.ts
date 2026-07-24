import { AppBskyFeedDefs } from "@atproto/api";
type PostView = AppBskyFeedDefs.PostView;
import { agent } from "../agent.js";

/** 投稿 URI 配列を 25 件ずつ取得して全件返す（いいね先の本文解決に使う）。 */
export async function getConcatPosts(uris: string[]): Promise<PostView[]> {
  const allPosts: PostView[] = [];
  for (let i = 0; i < uris.length; i += 25) {
    const chunk = uris.slice(i, i + 25);
    try {
      const response = await agent.getPosts({ uris: chunk });
      allPosts.push(...response.data.posts);
    } catch (error) {
      console.error(
        `[WARN][NAGI][ANALYSIS] Failed to fetch posts chunk at ${i}:`,
        error,
      );
    }
  }
  return allPosts;
}
