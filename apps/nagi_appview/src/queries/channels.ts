import { db, nagiChannels, nagiPosts } from "@bsky-affirmative-bot/database";
import type { ChannelView } from "@bsky-affirmative-bot/nagi-lexicon";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getTimeline } from "./timeline.js";

/** 活動順ソート用の下限（投稿ゼロの CH はここに沈む）。 */
const EPOCH = "1970-01-01T00:00:00.000Z";

const channelView = (row: {
  uri: string;
  cid: string;
  did: string;
  name: string;
  description: string | null;
  bannerCid: string | null;
  recordCreatedAt: Date;
  indexedAt: Date;
  lastPostAt: Date | null;
}): ChannelView => ({
  uri: row.uri,
  cid: row.cid,
  did: row.did,
  name: row.name,
  ...(row.description ? { description: row.description } : {}),
  ...(row.bannerCid
    ? { banner: `/api/blob/${encodeURIComponent(row.did)}/${row.bannerCid}` }
    : {}),
  createdAt: row.recordCreatedAt.toISOString(),
  indexedAt: row.indexedAt.toISOString(),
  ...(row.lastPostAt ? { lastPostAt: row.lastPostAt.toISOString() } : {}),
});

/** 各 CH の最新投稿時刻（活動順・過疎判定に再利用できる）。削除済み投稿は除く。 */
const lastPostSub = db
  .select({
    channelUri: nagiPosts.channelUri,
    lastPostAt: sql<Date>`max(${nagiPosts.indexedAt})`.as("last_post_at"),
  })
  .from(nagiPosts)
  .where(isNull(nagiPosts.deletedAt))
  .groupBy(nagiPosts.channelUri)
  .as("lp");

/** ソートキー: COALESCE(最新投稿, epoch)。投稿のある CH ほど上位、無い CH は epoch で末尾。 */
const sortAt = sql<Date>`coalesce(${lastPostSub.lastPostAt}, ${EPOCH}::timestamptz)`;

const encodeCursor = (sort: string, uri: string) =>
  Buffer.from(JSON.stringify([sort, uri])).toString("base64url");
const decodeCursor = (cursor?: string): [string, string] | undefined => {
  try {
    const [s, u] = JSON.parse(Buffer.from(cursor!, "base64url").toString());
    return [s, u];
  } catch {
    return undefined;
  }
};

export async function getChannels(opts: { limit: number; cursor?: string }) {
  const point = decodeCursor(opts.cursor);
  const filters: any[] = [isNull(nagiChannels.deletedAt)];
  if (point)
    filters.push(
      sql`(${sortAt}, ${nagiChannels.uri}) < (${point[0]}::timestamptz, ${point[1]})`,
    );
  const rows = await db
    .select({
      uri: nagiChannels.uri,
      cid: nagiChannels.cid,
      did: nagiChannels.did,
      name: nagiChannels.name,
      description: nagiChannels.description,
      bannerCid: nagiChannels.bannerCid,
      recordCreatedAt: nagiChannels.recordCreatedAt,
      indexedAt: nagiChannels.indexedAt,
      lastPostAt: lastPostSub.lastPostAt,
    })
    .from(nagiChannels)
    .leftJoin(lastPostSub, eq(lastPostSub.channelUri, nagiChannels.uri))
    .where(and(...filters))
    .orderBy(sql`${sortAt} desc`, sql`${nagiChannels.uri} desc`)
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  const last = page.at(-1);
  return {
    channels: page.map(channelView),
    cursor:
      rows.length > opts.limit && last
        ? encodeCursor((last.lastPostAt ?? new Date(EPOCH)).toISOString(), last.uri)
        : undefined,
    hasMore: rows.length > opts.limit,
  };
}

export async function getChannel(uri: string): Promise<ChannelView | null> {
  const rows = await db
    .select({
      uri: nagiChannels.uri,
      cid: nagiChannels.cid,
      did: nagiChannels.did,
      name: nagiChannels.name,
      description: nagiChannels.description,
      bannerCid: nagiChannels.bannerCid,
      recordCreatedAt: nagiChannels.recordCreatedAt,
      indexedAt: nagiChannels.indexedAt,
      lastPostAt: lastPostSub.lastPostAt,
    })
    .from(nagiChannels)
    .leftJoin(lastPostSub, eq(lastPostSub.channelUri, nagiChannels.uri))
    .where(and(eq(nagiChannels.uri, uri), isNull(nagiChannels.deletedAt)))
    .limit(1);
  return rows[0] ? channelView(rows[0]) : null;
}

/** CH タイムライン。channelOnly/kossori に関係なく当該 CH の投稿を全部（返信も）出す。 */
export function getChannelTimeline(opts: {
  uri: string;
  limit: number;
  cursor?: string;
  viewerDid?: string;
}) {
  return getTimeline({
    limit: opts.limit,
    cursor: opts.cursor,
    viewerDid: opts.viewerDid,
    channelUri: opts.uri,
  });
}
