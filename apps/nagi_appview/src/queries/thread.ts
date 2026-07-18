import { db, nagiPosts } from "@bsky-affirmative-bot/database";
import { eq, or } from "drizzle-orm";
import { ApiError } from "../middleware/errors.js";
export async function getThread(uri: string) {
  const rows = await db
    .select()
    .from(nagiPosts)
    .where(
      or(
        eq(nagiPosts.uri, uri),
        eq(nagiPosts.replyRootUri, uri),
        eq(nagiPosts.replyParentUri, uri),
      ),
    );
  const root = rows.find((r) => r.uri === uri);
  if (!root) throw new ApiError(404, "not_found", "Thread not found");
  return { thread: { post: root, replies: rows.filter((r) => r.uri !== uri) } };
}
