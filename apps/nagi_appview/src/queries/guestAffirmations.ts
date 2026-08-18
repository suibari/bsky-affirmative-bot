import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import {
  db,
  nagiGuestAffirmationJobs,
} from "@bsky-affirmative-bot/database";
import { ApiError } from "../middleware/errors.js";

const RETENTION_MS = 24 * 60 * 60_000;
const tokenHash = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex");

const credentials = (input: unknown) => {
  const value = input as { id?: unknown; token?: unknown } | undefined;
  if (
    typeof value?.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(value.id) ||
    typeof value.token !== "string" ||
    value.token.length < 32
  )
    throw new ApiError(400, "invalid_request", "Invalid guest request credentials");
  return { id: value.id, accessTokenHash: tokenHash(value.token) };
};

/** 期限切れ本文を通常処理のたびに小さく掃除し、ゲスト入力を恒久保存しない。 */
async function purgeExpired(now = new Date()) {
  await db
    .delete(nagiGuestAffirmationJobs)
    .where(lt(nagiGuestAffirmationJobs.expiresAt, now));
}

export async function createGuestAffirmation(input: unknown) {
  const value = input as { text?: unknown; language?: unknown } | undefined;
  const text = typeof value?.text === "string" ? value.text.trim() : "";
  const language = value?.language === "en" ? "en" : "ja";
  const graphemes = [...new Intl.Segmenter(language, { granularity: "grapheme" }).segment(text)]
    .length;
  if (!text || graphemes > 3_000)
    throw new ApiError(400, "invalid_request", "Text must be 1 to 3000 characters");

  await purgeExpired();
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.insert(nagiGuestAffirmationJobs).values({
    id,
    accessTokenHash: tokenHash(token),
    text,
    language,
    expiresAt: new Date(now.getTime() + RETENTION_MS),
    createdAt: now,
    updatedAt: now,
  });
  return { id, token, state: "pending" as const, expiresAt: new Date(now.getTime() + RETENTION_MS).toISOString() };
}

export async function getGuestAffirmation(input: unknown) {
  const key = credentials(input);
  const [row] = await db
    .select({
      state: nagiGuestAffirmationJobs.state,
      reply: nagiGuestAffirmationJobs.reply,
      expiresAt: nagiGuestAffirmationJobs.expiresAt,
    })
    .from(nagiGuestAffirmationJobs)
    .where(
      and(
        eq(nagiGuestAffirmationJobs.id, key.id),
        eq(nagiGuestAffirmationJobs.accessTokenHash, key.accessTokenHash),
      ),
    )
    .limit(1);
  if (!row || row.expiresAt <= new Date())
    throw new ApiError(404, "not_found", "Guest affirmation not found");
  return {
    state: row.state,
    ...(row.state === "posted" && row.reply ? { reply: row.reply } : {}),
  };
}

export async function deleteGuestAffirmation(input: unknown) {
  const key = credentials(input);
  await db
    .delete(nagiGuestAffirmationJobs)
    .where(
      and(
        eq(nagiGuestAffirmationJobs.id, key.id),
        eq(nagiGuestAffirmationJobs.accessTokenHash, key.accessTokenHash),
      ),
    );
  return { deleted: true };
}
