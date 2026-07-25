import { db, nagiChannels, nagiPosts } from "@bsky-affirmative-bot/database";
import type { ChannelView } from "@bsky-affirmative-bot/nagi-lexicon";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import {
  fetchPostRows,
  getTimeline,
  hydratePostViews,
} from "./timeline.js";
import { embedQuery, hybridConditions } from "./hybridSearch.js";
import { channelView, iso } from "./channelView.js";
import { isChannelMuted, loadMutes } from "./mutes.js";

// 検索は関連順のため offset ベースのページング（tag/一覧の keyset とは別系統）。
const encodeOffset = (offset: number) =>
  Buffer.from(String(offset)).toString("base64url");
const decodeOffset = (cursor?: string): number => {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, "base64url").toString());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

/** 活動順ソート用の下限（投稿ゼロの CH はここに沈む）。 */
const EPOCH = "1970-01-01T00:00:00.000Z";

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

export async function getChannels(opts: {
  limit: number;
  cursor?: string;
  viewerDid?: string;
}) {
  const point = decodeCursor(opts.cursor);
  const mutes = await loadMutes(opts.viewerDid);
  const filters: any[] = [isNull(nagiChannels.deletedAt)];
  // ミュートした CH は一覧に出さない（URL 直打ちの getChannel だけは通す）。
  if (mutes.channels.length)
    filters.push(notInArray(nagiChannels.uri, mutes.channels));
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
      pinnedPostUri: nagiChannels.pinnedPostUri,
      pinnedPostCid: nagiChannels.pinnedPostCid,
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
        ? encodeCursor(iso(last.lastPostAt ?? EPOCH), last.uri)
        : undefined,
    hasMore: rows.length > opts.limit,
  };
}

/**
 * チャンネルの自然文検索。name+description を対象に意味検索(pgvector)+trgm 語彙一致の
 * ハイブリッド。出力形状は getChannels と同じ。
 */
export async function searchChannels(opts: {
  q: string;
  limit: number;
  cursor?: string;
  viewerDid?: string;
}) {
  const q = opts.q.trim();
  const offset = decodeOffset(opts.cursor);
  const [embedding, mutes] = await Promise.all([
    embedQuery(q),
    loadMutes(opts.viewerDid),
  ]);
  const textExpr = sql`coalesce(${nagiChannels.name}, '') || ' ' || coalesce(${nagiChannels.description}, '')`;
  const { match, orderBy } = hybridConditions({
    embedding,
    q,
    embeddingCol: nagiChannels.embedding,
    textExpr,
  });
  const rows = await db
    .select({
      uri: nagiChannels.uri,
      cid: nagiChannels.cid,
      did: nagiChannels.did,
      name: nagiChannels.name,
      description: nagiChannels.description,
      bannerCid: nagiChannels.bannerCid,
      pinnedPostUri: nagiChannels.pinnedPostUri,
      pinnedPostCid: nagiChannels.pinnedPostCid,
      recordCreatedAt: nagiChannels.recordCreatedAt,
      indexedAt: nagiChannels.indexedAt,
      lastPostAt: lastPostSub.lastPostAt,
    })
    .from(nagiChannels)
    .leftJoin(lastPostSub, eq(lastPostSub.channelUri, nagiChannels.uri))
    .where(
      and(
        isNull(nagiChannels.deletedAt),
        ...(mutes.channels.length
          ? [notInArray(nagiChannels.uri, mutes.channels)]
          : []),
        match,
      ),
    )
    .orderBy(orderBy, sql`${nagiChannels.uri} desc`)
    .limit(opts.limit + 1)
    .offset(offset);
  const page = rows.slice(0, opts.limit);
  const hasMore = rows.length > opts.limit;
  return {
    channels: page.map(channelView),
    cursor: hasMore ? encodeOffset(offset + opts.limit) : undefined,
    hasMore,
  };
}

export async function getChannel(
  uri: string,
  viewerDid?: string,
): Promise<ChannelView | null> {
  const rows = await db
    .select({
      uri: nagiChannels.uri,
      cid: nagiChannels.cid,
      did: nagiChannels.did,
      name: nagiChannels.name,
      description: nagiChannels.description,
      bannerCid: nagiChannels.bannerCid,
      pinnedPostUri: nagiChannels.pinnedPostUri,
      pinnedPostCid: nagiChannels.pinnedPostCid,
      recordCreatedAt: nagiChannels.recordCreatedAt,
      indexedAt: nagiChannels.indexedAt,
      lastPostAt: lastPostSub.lastPostAt,
    })
    .from(nagiChannels)
    .leftJoin(lastPostSub, eq(lastPostSub.channelUri, nagiChannels.uri))
    .where(and(eq(nagiChannels.uri, uri), isNull(nagiChannels.deletedAt)))
    .limit(1);
  if (!rows[0]) return null;
  // ミュート済みでも URL 直打ちなら開ける（プロフィールと同じ方針）。その画面で解除できるよう
  // viewerMuted だけ返す。ミュートは非公開情報なので、あくまで本人のリクエストにしか付かない。
  const muted = await isChannelMuted(viewerDid, uri);
  const channel: ChannelView = {
    ...channelView(rows[0]),
    ...(muted ? { viewerMuted: true } : {}),
  };
  if (!rows[0].pinnedPostUri) return channel;
  const [pinnedPost] = await hydratePostViews(
    await fetchPostRows([rows[0].pinnedPostUri]),
    viewerDid,
  );
  return pinnedPost &&
    !pinnedPost.deleted &&
    pinnedPost.channel?.uri === uri
    ? { ...channel, pinnedPost }
    : channel;
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
