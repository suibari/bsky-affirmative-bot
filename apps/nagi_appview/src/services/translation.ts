import { db, nagiPosts, nagiTranslations } from "@bsky-affirmative-bot/database";
import { and, eq } from "drizzle-orm";
import { config } from "../config.js";
import { ApiError } from "../middleware/errors.js";
export async function translatePost(uri: string, targetLang: string) {
  const cached = await db
    .select()
    .from(nagiTranslations)
    .where(and(eq(nagiTranslations.postUri, uri), eq(nagiTranslations.targetLang, targetLang)))
    .limit(1);
  if (cached[0]) return { text: cached[0].text, cached: true };
  const post = await db.select().from(nagiPosts).where(eq(nagiPosts.uri, uri)).limit(1);
  if (!post[0]) throw new ApiError(404, "not_found", "Post not found");
  const response = await fetch(`${config.ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.translationModel,
      prompt: `Translate the following text to ${targetLang}. Return only the translation.\n\n${post[0].text}`,
      stream: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new ApiError(503, "upstream_unavailable", "Translation failed");
  const data: any = await response.json();
  const text = String(data.response ?? "").trim();
  await db
    .insert(nagiTranslations)
    .values({ postUri: uri, targetLang, text })
    .onConflictDoNothing();
  return { text, cached: false };
}
