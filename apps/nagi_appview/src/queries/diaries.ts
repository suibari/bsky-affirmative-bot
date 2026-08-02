import { db, nagiDiaries } from "@bsky-affirmative-bot/database";
import type { DiaryView } from "@bsky-affirmative-bot/nagi-lexicon";
import { and, asc, desc, eq, inArray, like, lt } from "drizzle-orm";
import { ApiError } from "../middleware/errors.js";

type DiaryRow = typeof nagiDiaries.$inferSelect;

export function diaryView(row: DiaryRow): DiaryView {
  return {
    uri: row.uri,
    cid: row.cid,
    subject: row.subjectDid,
    date: row.diaryDate,
    text: row.text,
    titleJa: row.titleJa ?? undefined,
    titleEn: row.titleEn ?? undefined,
    emoji: row.emoji ?? undefined,
    postCount: row.postCount ?? undefined,
    langs: (row.langs as string[] | null) ?? undefined,
    createdAt: row.recordCreatedAt.toISOString(),
    indexedAt: row.indexedAt.toISOString(),
  };
}

/** 通知の hydrate 用。 */
export async function fetchDiaryRows(uris: string[]): Promise<DiaryRow[]> {
  if (!uris.length) return [];
  return db.select().from(nagiDiaries).where(inArray(nagiDiaries.uri, uris));
}

/**
 * プロフィールの日記タブ用。
 * month（"YYYY-MM"）を指定するとその月の全件を日付昇順で返す（カレンダー表示）。
 * 未指定なら新しい順にページングする。
 */
export async function getDiaries(opts: {
  actor: string;
  month?: string;
  limit: number;
  cursor?: string;
}): Promise<{ items: DiaryView[]; cursor?: string; hasMore: boolean }> {
  if (!opts.actor) throw new ApiError(400, "invalid_request", "actor is required");
  if (opts.month && !/^\d{4}-\d{2}$/.test(opts.month))
    throw new ApiError(400, "invalid_request", "Invalid month");

  if (opts.month) {
    const rows = await db
      .select()
      .from(nagiDiaries)
      .where(
        and(
          eq(nagiDiaries.subjectDid, opts.actor),
          like(nagiDiaries.diaryDate, `${opts.month}-%`),
        ),
      )
      .orderBy(asc(nagiDiaries.diaryDate));
    return { items: rows.map(diaryView), hasMore: false };
  }

  const filters = [eq(nagiDiaries.subjectDid, opts.actor)];
  // カーソルは日付そのもの。(subject, date) が一意なのでこれで十分。
  if (opts.cursor) filters.push(lt(nagiDiaries.diaryDate, opts.cursor));
  const rows = await db
    .select()
    .from(nagiDiaries)
    .where(and(...filters))
    .orderBy(desc(nagiDiaries.diaryDate))
    .limit(opts.limit);
  const items = rows.map(diaryView);
  return {
    items,
    cursor: items.length === opts.limit ? items[items.length - 1].date : undefined,
    hasMore: items.length === opts.limit,
  };
}
