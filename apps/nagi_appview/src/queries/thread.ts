import { db, nagiPosts } from "@bsky-affirmative-bot/database";
import type { ThreadView } from "@bsky-affirmative-bot/nagi-lexicon";
import { eq, or } from "drizzle-orm";
import { ApiError } from "../middleware/errors.js";
import { fetchPostRows, hydratePostViews } from "./timeline.js";
export async function getThread(
  uri: string,
  viewerDid?: string,
): Promise<{ thread: ThreadView }> {
  const [requested] = await db
    .select({ uri: nagiPosts.uri, replyRootUri: nagiPosts.replyRootUri })
    .from(nagiPosts)
    .where(eq(nagiPosts.uri, uri))
    .limit(1);
  if (!requested) throw new ApiError(404, "not_found", "Thread not found");

  // 返信のURLから開いた場合も、StrongRef が指す真のルートを起点にスレッド全体を返す。
  // ルートを解決できない状態で返信だけを見せると、ルート所有の可視性を誤るため fail closed にする。
  const rootUri = requested.replyRootUri ?? requested.uri;
  const rows = await db
    .select({ uri: nagiPosts.uri })
    .from(nagiPosts)
    .where(or(eq(nagiPosts.uri, rootUri), eq(nagiPosts.replyRootUri, rootUri)));
  const views = await hydratePostViews(
    await fetchPostRows(rows.map((r) => r.uri)),
    viewerDid,
  );
  const post = views.find((v) => v.uri === rootUri);
  if (!post) throw new ApiError(404, "not_found", "Thread not found");
  const replies = views
    .filter((v) => v.uri !== rootUri && !v.deleted)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { thread: { post, replies } };
}
