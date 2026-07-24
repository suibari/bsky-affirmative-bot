import { generateEmbedding } from "@bsky-affirmative-bot/database";
import { and, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";

// 意味検索の距離しきい値（cosine 距離 = 1 - 類似度）。実コーパスの実測（関連 ~0.5-0.6 /
// 無関連 ~0.65+）に合わせた既定。テスト中に手元調整できるよう env 可変。
export const SEM_DIST_MAX = (() => {
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

/** 検索クエリを埋め込む。空文字や Ollama 不通なら null（呼び出し側は語彙のみにフォールバック）。 */
export async function embedQuery(q: string): Promise<number[] | null> {
  const t = q.trim();
  return t ? generateEmbedding(`${QUERY_PREFIX}${t}`) : null;
}

/**
 * 意味検索(pgvector) + trgm 語彙一致のハイブリッド条件を組み立てる共通ヘルパ。
 * 投稿・ユーザー・チャンネル・ニュースで、対象の embedding 列・テキスト式だけ差し替えて使い回す。
 * 返り値の `orderBy` はスコア降順のみ（各呼び出し側で一意キーの tiebreak を付け足すこと）。
 */
export function hybridConditions(opts: {
  embedding: number[] | null;
  q: string;
  /** cosine 近傍に使う embedding 列。 */
  embeddingCol: SQLWrapper;
  /** ILIKE / trgm similarity に使うテキスト式（列でも `coalesce(a,'')||' '||coalesce(b,'')` でも可）。 */
  textExpr: SQLWrapper;
}): { match: SQL; orderBy: SQL } {
  const { embedding, q, embeddingCol, textExpr } = opts;
  const like = `%${q}%`;

  if (embedding) {
    const vec = sql`${`[${embedding.join(",")}]`}::vector`;
    const dist = sql`(${embeddingCol} <=> ${vec})`;
    const match = or(
      and(sql`${embeddingCol} is not null`, sql`${dist} < ${SEM_DIST_MAX}`),
      sql`${textExpr} ilike ${like}`,
    )!;
    const semScore = sql`case when ${embeddingCol} is not null then 1 - ${dist} else 0 end`;
    const lexScore = sql`similarity(${textExpr}, ${q})`;
    const orderBy = sql`(${SEM_WEIGHT} * (${semScore}) + ${LEX_WEIGHT} * (${lexScore})) desc`;
    return { match, orderBy };
  }

  // Ollama 不通/未設定: 語彙のみで検索。
  const match = or(
    sql`${textExpr} ilike ${like}`,
    sql`similarity(${textExpr}, ${q}) > ${LEX_ONLY_MIN_SIM}`,
  )!;
  const orderBy = sql`similarity(${textExpr}, ${q}) desc`;
  return { match, orderBy };
}
