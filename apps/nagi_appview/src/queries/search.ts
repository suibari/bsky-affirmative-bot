import {
  db,
  generateEmbedding,
  nagiActors,
  nagiPostScores,
  nagiPosts,
  nagiProfiles,
} from "@bsky-affirmative-bot/database";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { config } from "../config.js";
import { buildFeedItems, getBotActor, postSelection } from "./timeline.js";

// 意味検索の距離しきい値（cosine 距離 = 1 - 類似度）。これより遠い投稿は語彙一致(ILIKE)
// が無い限り除外する。実コーパスの実測（関連 ~0.5-0.6 / 無関連 ~0.65+）に合わせた既定。
// テスト中に手元調整できるよう env 可変。
const SEM_DIST_MAX = (() => {
  const v = Number(process.env.SEARCH_SEM_DIST_MAX);
  return Number.isFinite(v) && v > 0 ? v : 0.65;
})();
// クエリ接頭辞。arctic-embed v2.0 は本来「クエリ側だけ query: を付ける」設計だが、Ollama の
// snowflake-arctic-embed2 は接頭辞を実装しておらず、付けると literal 本文として埋め込まれて
// 類似度が一律に圧縮される（実測でランキング不変・スコアのみ低下）。よって既定は無効（空文字）。
// 接頭辞を実装したモデルへ差し替える場合のみ env で "query: " 等を設定する。
const QUERY_PREFIX = process.env.OLLAMA_QUERY_PREFIX ?? "";
// 意味スコアと語彙スコアの重み（意味を主・語彙を補完）。
const SEM_WEIGHT = 0.7;
const LEX_WEIGHT = 0.3;
// Ollama 不通時（埋め込みなし）の語彙のみモードで足切りする trgm 類似度。
const LEX_ONLY_MIN_SIM = 0.1;

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
  // arctic-embed のクエリ接頭辞を付けて埋め込む（ドキュメント側 worker は接頭辞なしのまま）。
  const embedding = q ? await generateEmbedding(`${QUERY_PREFIX}${q}`) : null;

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

  const like = `%${q}%`;

  let match;
  let orderBy;
  if (embedding) {
    const vec = sql`${`[${embedding.join(",")}]`}::vector`;
    const dist = sql`(${nagiPosts.embedding} <=> ${vec})`;
    // 意味が近い（距離が小さい）か、語彙一致するものを対象に。
    match = or(
      and(sql`${nagiPosts.embedding} is not null`, sql`${dist} < ${SEM_DIST_MAX}`),
      sql`${nagiPosts.text} ilike ${like}`,
    );
    const semScore = sql`case when ${nagiPosts.embedding} is not null then 1 - ${dist} else 0 end`;
    const lexScore = sql`similarity(${nagiPosts.text}, ${q})`;
    orderBy = sql`(${SEM_WEIGHT} * (${semScore}) + ${LEX_WEIGHT} * (${lexScore})) desc, ${nagiPosts.uri} desc`;
  } else {
    // Ollama 不通/未設定: 語彙のみで検索。
    match = or(
      sql`${nagiPosts.text} ilike ${like}`,
      sql`similarity(${nagiPosts.text}, ${q}) > ${LEX_ONLY_MIN_SIM}`,
    );
    orderBy = sql`similarity(${nagiPosts.text}, ${q}) desc, ${nagiPosts.uri} desc`;
  }

  const rows = await db
    .select(postSelection)
    .from(nagiPosts)
    .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
    .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiPosts.did))
    .leftJoin(nagiPostScores, eq(nagiPostScores.postUri, nagiPosts.uri))
    .where(and(...visibility, match))
    .orderBy(orderBy)
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
