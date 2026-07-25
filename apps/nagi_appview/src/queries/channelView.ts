import type { ChannelView } from "@bsky-affirmative-bot/nagi-lexicon";

// max(indexed_at) など生 SQL 式の結果は drizzle が Date へ変換せず文字列で返すことがある。
// timestamp 列も含め new Date() で包んでから ISO 化する（Date でも文字列でも安全）。
export const iso = (value: Date | string) => new Date(value).toISOString();

export type ChannelRow = {
  uri: string;
  cid: string;
  did: string;
  name: string;
  description: string | null;
  bannerCid: string | null;
  pinnedPostUri: string | null;
  pinnedPostCid: string | null;
  recordCreatedAt: Date | string;
  indexedAt: Date | string;
  lastPostAt: Date | string | null;
};

/**
 * チャンネル行 → ChannelView。channels.ts とミュート一覧(mutes.ts)の双方から使うため、
 * 循環 import を避けてここに置く（channels.ts は mutes.ts に依存する）。
 */
export const channelView = (row: ChannelRow): ChannelView => ({
  uri: row.uri,
  cid: row.cid,
  did: row.did,
  name: row.name,
  ...(row.description ? { description: row.description } : {}),
  ...(row.bannerCid
    ? { banner: `/api/blob/${encodeURIComponent(row.did)}/${row.bannerCid}` }
    : {}),
  createdAt: iso(row.recordCreatedAt),
  indexedAt: iso(row.indexedAt),
  ...(row.lastPostAt ? { lastPostAt: iso(row.lastPostAt) } : {}),
  ...(row.pinnedPostUri && row.pinnedPostCid
    ? {
        pinnedPostRef: {
          uri: row.pinnedPostUri,
          cid: row.pinnedPostCid,
        },
      }
    : {}),
});
