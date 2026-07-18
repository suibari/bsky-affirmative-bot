import { db, nagiPosts } from "@bsky-affirmative-bot/database";
import type { ThreadView } from "@bsky-affirmative-bot/nagi-lexicon";
import { eq, or } from "drizzle-orm";
import { ApiError } from "../middleware/errors.js";
import { fetchPostRows, hydratePostViews } from "./timeline.js";
export async function getThread(
  uri: string,
  viewerDid?: string,
): Promise<{ thread: ThreadView }> {
  const rows = await db
    .select({ uri: nagiPosts.uri })
    .from(nagiPosts)
    .where(
      or(eq(nagiPosts.uri, uri), eq(nagiPosts.replyRootUri, uri), eq(nagiPosts.replyParentUri, uri)),
    );
  const views = await hydratePostViews(
    await fetchPostRows(rows.map((r) => r.uri)),
    viewerDid,
  );
  const post = views.find((v) => v.uri === uri);
  if (!post) throw new ApiError(404, "not_found", "Thread not found");
  const replies = views
    .filter((v) => v.uri !== uri && !v.deleted)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { thread: { post, replies } };
}
