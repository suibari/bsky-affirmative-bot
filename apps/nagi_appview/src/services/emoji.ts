import { db, nagiEmojis } from "@bsky-affirmative-bot/database";
import {
  BLUEMOJI_ITEM,
  type BluemojiItem,
  type EmojiView,
} from "@bsky-affirmative-bot/nagi-lexicon";
import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import {
  isNormalizedBluemojiFormats,
  normalizeBluemojiFormats,
  validateRecord,
} from "../ingest/validateRecord.js";
import { ApiError } from "../middleware/errors.js";
import { resolvePdsUrl } from "../util/pds.js";

export type EmojiRow = typeof nagiEmojis.$inferSelect;
// drizzle のトランザクションもこの形を満たすので、ingest からは tx を渡せる。
type Executor = Pick<typeof db, "select" | "insert" | "delete">;

export function emojiView(row: EmojiRow): EmojiView | null {
  if (!isNormalizedBluemojiFormats(row.formats)) return null;
  const { asset } = row.formats;
  const url = `/api/emoji-asset/${encodeURIComponent(row.did)}/${encodeURIComponent(
    row.uri.slice(row.uri.lastIndexOf("/") + 1),
  )}/${encodeURIComponent(row.cid)}`;
  return {
    uri: row.uri,
    cid: row.cid,
    did: row.did,
    name: row.name,
    alt: row.alt ?? undefined,
    url,
    mediaType: asset.mediaType,
  };
}

/**
 * blue.moji.collection.item をインデックスする。record は検証済みであること。
 * 自己申告される formats はここ（＝レコード本体）の値だけを信頼する。
 */
export async function indexEmoji(
  executor: Executor,
  input: { uri: string; cid: string; did: string; record: any },
) {
  const { uri, cid, did, record } = input;
  const values = {
    uri,
    cid,
    did,
    name: record.name as string,
    alt: typeof record.alt === "string" ? record.alt : null,
    formats: normalizeBluemojiFormats(record.formats)!,
    adultOnly: record.adultOnly === true,
    createdAt: new Date(record.createdAt),
  };
  const sameUri = await executor
    .select({
      uri: nagiEmojis.uri,
      did: nagiEmojis.did,
      name: nagiEmojis.name,
    })
    .from(nagiEmojis)
    .where(eq(nagiEmojis.uri, uri))
    .limit(1);
  // 同じ URI のレコードが名前を変えた場合、旧意味キーの投影を先に外す。
  if (sameUri[0] && (sameUri[0].did !== did || sameUri[0].name !== values.name))
    await executor.delete(nagiEmojis).where(eq(nagiEmojis.uri, uri));
  await executor
    .insert(nagiEmojis)
    .values(values)
    .onConflictDoUpdate({
      target: [nagiEmojis.did, nagiEmojis.name],
      set: values,
      // 同じ URI の更新、または別 URI のうち createdAt が新しい方だけを採用する。
      // 同時取り込みでも一意制約側で原子的に勝者を決める。
      setWhere: sql`${nagiEmojis.uri} = excluded.uri or (${nagiEmojis.createdAt}, ${nagiEmojis.uri}) < (excluded.created_at, excluded.uri)`,
    });
}

const NEGATIVE_TTL_MS = 5 * 60_000;
const negativeCache = new Map<string, number>();

async function fetchEmojiRecord(uri: string) {
  const [, , did, collection, rkey] = uri.split("/");
  if (collection !== BLUEMOJI_ITEM || !did || !rkey) return null;
  const url = await resolvePdsUrl(did);
  url.pathname = "/xrpc/com.atproto.repo.getRecord";
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", collection);
  url.searchParams.set("rkey", rkey);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;
  const body: any = await response.json();
  const record = body?.value;
  if (typeof body?.cid !== "string") return null;
  if (!validateRecord(BLUEMOJI_ITEM, record)) return null;
  return { uri, cid: body.cid as string, did, record };
}

/**
 * インデックス済みのカスタム絵文字を返す。未知の URI は参照された時点で
 * 元 PDS から取得してインデックスする（オンデマンド取り込み）。
 */
export async function resolveEmoji(uri: string): Promise<EmojiRow | null> {
  const indexed = await db
    .select()
    .from(nagiEmojis)
    .where(eq(nagiEmojis.uri, uri))
    .limit(1);
  if (indexed[0]) return indexed[0];

  const failedAt = negativeCache.get(uri);
  if (failedAt !== undefined && Date.now() - failedAt < NEGATIVE_TTL_MS)
    return null;
  try {
    const fetched = await fetchEmojiRecord(uri);
    if (!fetched) {
      negativeCache.set(uri, Date.now());
      return null;
    }
    await indexEmoji(db, fetched);
    const rows = await db
      .select()
      .from(nagiEmojis)
      .where(eq(nagiEmojis.uri, uri))
      .limit(1);
    return rows[0] ?? null;
  } catch (e) {
    console.error("[emoji] on-demand index failed", uri, e);
    negativeCache.set(uri, Date.now());
    return null;
  }
}

/**
 * 設定一覧はPDS上の準拠レコードをすべて表示する。同名の新しいレコードが意味キーを
 * 代表していてDBへ入らない旧URIでも、要求CIDのPDSレコード自体を検証して資産を返す。
 */
export async function resolveEmojiAsset(uri: string, expectedCid: string) {
  const fetched = await fetchEmojiRecord(uri);
  if (!fetched || fetched.cid !== expectedCid) return null;
  await indexEmoji(db, fetched);
  return normalizeBluemojiFormats((fetched.record as BluemojiItem).formats);
}

export async function getEmoji(uri: string) {
  if (!uri.startsWith("at://") || uri.split("/")[3] !== BLUEMOJI_ITEM)
    throw new ApiError(400, "invalid_request", "Invalid Bluemoji URI");
  const row = await resolveEmoji(uri);
  const view = row ? emojiView(row) : null;
  if (!view) throw new ApiError(404, "not_found", "Emoji not found");
  return { emoji: view };
}

export async function searchEmojis(params: {
  q?: string;
  repo?: string;
  excludeRepo?: string;
  limit: number;
  cursor?: string;
}) {
  const { q, repo, excludeRepo, limit, cursor } = params;
  const conditions = [
    // adultOnly の絵文字はピッカーに出さない（表示前の警告UIが無いため）。
    eq(nagiEmojis.adultOnly, false),
    // limit/cursor を適用した後に emojiView で旧形式行を落とすと、移行中は
    // emojis=[] のまま cursor だけ返り、1ページしか読まないピッカーが空になる。
    // 表示可能な正規化済み行だけをSQLページングの母集団にする。
    sql<boolean>`
      ${nagiEmojis.formats}->>'version' = '1'
      and ${nagiEmojis.formats}->'asset'->>'kind' in ('blob', 'bytes')
      and length(${nagiEmojis.formats}->'asset'->>'value') > 0
      and (
        ${nagiEmojis.formats}->'asset'->>'mediaType' like 'image/%'
        or ${nagiEmojis.formats}->'asset'->>'mediaType' = 'application/lottie+zip'
      )
    `,
  ];
  if (q)
    conditions.push(
      ilike(nagiEmojis.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`),
    );
  if (repo) conditions.push(eq(nagiEmojis.did, repo));
  if (excludeRepo)
    conditions.push(sql<boolean>`${nagiEmojis.did} <> ${excludeRepo}`);
  if (cursor) {
    const [indexedAt, uri] = cursor.split("::");
    const at = new Date(indexedAt);
    if (!Number.isNaN(at.valueOf()) && uri)
      conditions.push(
        or(
          lt(nagiEmojis.indexedAt, at),
          and(eq(nagiEmojis.indexedAt, at), lt(nagiEmojis.uri, uri)),
        )!,
      );
  }
  const rows = await db
    .select()
    .from(nagiEmojis)
    .where(and(...conditions))
    .orderBy(desc(nagiEmojis.indexedAt), desc(nagiEmojis.uri))
    .limit(limit);
  const last = rows[rows.length - 1];
  return {
    emojis: rows.flatMap((row) => emojiView(row) ?? []),
    cursor:
      rows.length === limit && last
        ? `${last.indexedAt.toISOString()}::${last.uri}`
        : undefined,
  };
}
