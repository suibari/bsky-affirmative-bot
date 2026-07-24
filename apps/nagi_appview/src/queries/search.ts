import {
  db,
  nagiActors,
  nagiPostScores,
  nagiPosts,
  nagiProfiles,
} from "@bsky-affirmative-bot/database";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { config } from "../config.js";
import { buildFeedItems, getBotActor, postSelection } from "./timeline.js";
import { embedQuery, hybridConditions } from "./hybridSearch.js";

const encodeCursor = (offset: number) =>
  Buffer.from(String(offset)).toString("base64url");
const decodeCursor = (cursor?: string): number => {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, "base64url").toString());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

/**
 * 自然文キーワード検索（NL検索の土台）。意味検索(pgvector)を主、trgm 語彙一致を補完にした
 * ハイブリッド。共有タイムラインと同じ可視性（削除・こっそり・CH限定・bot返信のグルーピング）
 * を適用し、結果は getTimeline と同じ FeedItem 形状で返す。
 *
 * ランキング順のためページングは offset ベース（cursor に offset を base64 で載せる）。
 */
export async function searchPostsByText(opts: {
  q: string;
  limit: number;
  cursor?: string;
  viewerDid?: string;
}) {
  const q = opts.q.trim();
  const offset = decodeCursor(opts.cursor);
  const embedding = await embedQuery(q);

  // 共有TLと同じ可視性フィルタ（getTimeline の !actorDid && !channelUri 経路を踏襲）。
  const visibility = [
    isNull(nagiPosts.deletedAt),
    // botたんの返信は元投稿にまとめるため単独では出さない。
    or(ne(nagiPosts.did, config.botDid), isNull(nagiPosts.replyParentUri)),
    // こっそり/CH限定はスレッドルートが所有。未解決の返信は非共有側へ倒す。
    sql`
      case
        when ${nagiPosts.replyRootUri} is null
          then not (${nagiPosts.kossori} or ${nagiPosts.channelOnly})
        else coalesce((
          select not (thread_root.kossori or thread_root.channel_only)
          from nagi.posts as thread_root
          where thread_root.uri = ${nagiPosts.replyRootUri}
            and thread_root.deleted_at is null
        ), false)
      end
    `,
  ];

  const { match, orderBy } = hybridConditions({
    embedding,
    q,
    embeddingCol: nagiPosts.embedding,
    textExpr: nagiPosts.text,
  });

  const rows = await db
    .select(postSelection)
    .from(nagiPosts)
    .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
    .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiPosts.did))
    .leftJoin(nagiPostScores, eq(nagiPostScores.postUri, nagiPosts.uri))
    .where(and(...visibility, match))
    .orderBy(orderBy, sql`${nagiPosts.uri} desc`)
    .limit(opts.limit + 1)
    .offset(offset);

  const page = rows.slice(0, opts.limit);
  const [items, botActor] = await Promise.all([
    buildFeedItems(page, opts.viewerDid, true, false),
    getBotActor(),
  ]);
  const hasMore = rows.length > opts.limit;
  return {
    items,
    botActor,
    cursor: hasMore ? encodeCursor(offset + opts.limit) : undefined,
    hasMore,
  };
}
