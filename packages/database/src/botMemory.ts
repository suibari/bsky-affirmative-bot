import { createHash } from "node:crypto";
import { aiModel } from "@bsky-affirmative-bot/shared-configs";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";
import {
  bot_memory_documents,
  bot_memory_usages,
  db,
} from "./db.js";
import { generateEmbedding } from "./ollamaEmbed.js";

export const BOT_MEMORY_SOURCE_TYPES = [
  "bsky_affirmed_post",
  "nagi_affirmed_post",
  "bsky_received_reply",
  "nagi_received_reply",
  "bsky_received_like",
  "nagi_received_reaction",
  "biorhythm",
  "youtube_live_comment",
] as const;

export type BotMemorySourceType = (typeof BOT_MEMORY_SOURCE_TYPES)[number];
export type BotMemoryPurpose = "reply_history" | "scheduled_post" | "live_filler";

export interface BotMemoryDocumentInput {
  sourceType: BotMemorySourceType;
  sourceId: string;
  sourceUri?: string | null;
  authorId?: string | null;
  content: string;
  botResponse?: string | null;
  occurredAt: Date;
  affirmationScore?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface BotMemorySearchRequest {
  query: string;
  purpose: BotMemoryPurpose;
  sources?: BotMemorySourceType[];
  authorId?: string;
  excludeAuthorId?: string;
  since?: Date;
  until?: Date;
  excludeDocumentIds?: number[];
  limit?: number;
}

export interface BotMemorySearchResult {
  id: number;
  sourceType: BotMemorySourceType;
  sourceId: string;
  sourceUri: string | null;
  authorId: string | null;
  content: string;
  botResponse: string | null;
  occurredAt: Date;
  affirmationScore: number | null;
  metadata: Record<string, unknown> | null;
  relevance: number;
  semanticRank?: number;
  lexicalRank?: number;
}

export function selectReplyMemoryContext(
  ownRows: BotMemorySearchResult[],
  friendRows: BotMemorySearchResult[],
  excludedAuthorIds: Iterable<string | undefined> = [],
) {
  const excluded = new Set([...excludedAuthorIds].filter(
    (value): value is string => Boolean(value),
  ));
  return {
    relatedPosts: ownRows.map((row) => row.content),
    // embedding障害時はlexicalだけになる。本人履歴には有用だが、友達の誤紹介は避ける。
    friendMemory: friendRows.find((row) =>
      row.semanticRank !== undefined &&
      Boolean(row.authorId) &&
      Boolean(row.sourceUri) &&
      !excluded.has(row.authorId!)
    ),
  };
}

export const botMemoryContentHash = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex");

export function shouldRememberAffirmedPost(input: {
  surface: "bsky" | "nagi";
  aiReplyPosted: boolean;
  isTopLevel: boolean;
  isPublic: boolean;
  isSubscriber?: boolean;
}) {
  return input.aiReplyPosted && input.isTopLevel && input.isPublic &&
    (input.surface === "nagi" || input.isSubscriber === true);
}

export const shouldRememberBskyLike = (isSubscriber: boolean) => isSubscriber;

export function formatReactionMemoryContent(
  targetText: string,
  reaction: string,
) {
  return `botたんの投稿「${targetText.trim()}」へのリアクション ${reaction.trim()}`;
}

export function isBotMemorySourceType(value: unknown): value is BotMemorySourceType {
  return typeof value === "string" &&
    (BOT_MEMORY_SOURCE_TYPES as readonly string[]).includes(value);
}

/**
 * 同じ source は1行だけ持つ。本文が同じ再試行では embedding を保ち、編集時だけ再生成する。
 */
export async function upsertBotMemoryDocument(input: BotMemoryDocumentInput) {
  const content = input.content.trim();
  if (!content) return null;
  const contentHash = botMemoryContentHash(content);
  const [row] = await db
    .insert(bot_memory_documents)
    .values({
      source_type: input.sourceType,
      source_id: input.sourceId,
      source_uri: input.sourceUri ?? null,
      author_id: input.authorId ?? null,
      content,
      bot_response: input.botResponse ?? null,
      occurred_at: input.occurredAt,
      affirmation_score: input.affirmationScore ?? null,
      metadata: input.metadata ?? null,
      content_hash: contentHash,
    })
    .onConflictDoUpdate({
      target: [bot_memory_documents.source_type, bot_memory_documents.source_id],
      set: {
        source_uri: input.sourceUri ?? null,
        author_id: input.authorId ?? null,
        content,
        bot_response: input.botResponse ?? null,
        occurred_at: input.occurredAt,
        affirmation_score: input.affirmationScore ?? null,
        metadata: input.metadata ?? null,
        content_hash: contentHash,
        embedding: sql`case when ${bot_memory_documents.content_hash} is distinct from ${contentHash} then null else ${bot_memory_documents.embedding} end`,
        embedding_model: sql`case when ${bot_memory_documents.content_hash} is distinct from ${contentHash} then null else ${bot_memory_documents.embedding_model} end`,
        deleted_at: null,
        updated_at: new Date(),
      },
    })
    .returning();
  return row ?? null;
}

/** 記憶基盤の障害で、すでに成功した返信や元サービスの処理を巻き戻さない。 */
export async function tryUpsertBotMemoryDocument(input: BotMemoryDocumentInput) {
  try {
    return await upsertBotMemoryDocument(input);
  } catch (error) {
    console.error("[ERROR][BOT_MEMORY] upsert failed; source processing continues", {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      error,
    });
    return null;
  }
}

export async function updateBotMemoryResponse(
  sourceType: BotMemorySourceType,
  sourceId: string,
  botResponse: string,
) {
  await db
    .update(bot_memory_documents)
    .set({ bot_response: botResponse, updated_at: new Date() })
    .where(and(
      eq(bot_memory_documents.source_type, sourceType),
      eq(bot_memory_documents.source_id, sourceId),
    ));
}

export async function tombstoneBotMemoryDocument(
  sourceType: BotMemorySourceType,
  sourceId: string,
) {
  await db
    .update(bot_memory_documents)
    .set({ deleted_at: new Date(), embedding: null, embedding_model: null, updated_at: new Date() })
    .where(and(
      eq(bot_memory_documents.source_type, sourceType),
      eq(bot_memory_documents.source_id, sourceId),
      isNull(bot_memory_documents.deleted_at),
    ));
}

export async function tombstoneBotMemoriesByUri(sourceUri: string) {
  await db
    .update(bot_memory_documents)
    .set({ deleted_at: new Date(), embedding: null, embedding_model: null, updated_at: new Date() })
    .where(and(
      eq(bot_memory_documents.source_uri, sourceUri),
      isNull(bot_memory_documents.deleted_at),
    ));
}

export async function tombstoneBotMemoriesBySubjectUri(subjectUri: string) {
  await db
    .update(bot_memory_documents)
    .set({ deleted_at: new Date(), embedding: null, embedding_model: null, updated_at: new Date() })
    .where(and(
      sql`${bot_memory_documents.metadata}->>'subjectUri' = ${subjectUri}`,
      isNull(bot_memory_documents.deleted_at),
    ));
}

/** 元投稿の編集を、すでに取り込まれている記憶だけへ反映する。新規行は作らない。 */
export async function updateBotMemoriesByUri(sourceUri: string, content: string) {
  const normalized = content.trim();
  if (!normalized) {
    await tombstoneBotMemoriesByUri(sourceUri);
    return;
  }
  const contentHash = botMemoryContentHash(normalized);
  await db
    .update(bot_memory_documents)
    .set({
      content: normalized,
      content_hash: contentHash,
      embedding: sql`case when ${bot_memory_documents.content_hash} is distinct from ${contentHash} then null else ${bot_memory_documents.embedding} end`,
      embedding_model: sql`case when ${bot_memory_documents.content_hash} is distinct from ${contentHash} then null else ${bot_memory_documents.embedding_model} end`,
      updated_at: new Date(),
      deleted_at: null,
    })
    .where(eq(bot_memory_documents.source_uri, sourceUri));
}

/** いいね/リアクションが参照するbot投稿の編集を、合成済み検索本文へ反映する。 */
export async function updateBotReactionMemorySubjects(
  subjectUri: string,
  targetText: string,
) {
  const rows = await db
    .select({
      id: bot_memory_documents.id,
      sourceType: bot_memory_documents.source_type,
      metadata: bot_memory_documents.metadata,
    })
    .from(bot_memory_documents)
    .where(and(
      sql`${bot_memory_documents.metadata}->>'subjectUri' = ${subjectUri}`,
      isNull(bot_memory_documents.deleted_at),
    ));
  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const label = typeof metadata.reactionLabel === "string"
      ? metadata.reactionLabel
      : row.sourceType === "bsky_received_like"
        ? "いいね"
        : [metadata.emojiName ?? metadata.emoji, metadata.emojiAlt]
            .filter((value): value is string => typeof value === "string" && value.length > 0)
            .join(" ");
    const content = formatReactionMemoryContent(targetText, label || "リアクション");
    await db
      .update(bot_memory_documents)
      .set({
        content,
        content_hash: botMemoryContentHash(content),
        embedding: null,
        embedding_model: null,
        updated_at: new Date(),
      })
      .where(eq(bot_memory_documents.id, row.id));
  }
}

export async function getPendingBotMemoryDocuments(limit = 16) {
  return db
    .select({
      id: bot_memory_documents.id,
      content: bot_memory_documents.content,
      contentHash: bot_memory_documents.content_hash,
    })
    .from(bot_memory_documents)
    .where(and(
      isNull(bot_memory_documents.deleted_at),
      isNull(bot_memory_documents.embedding),
    ))
    .orderBy(desc(bot_memory_documents.updated_at))
    .limit(Math.max(1, Math.min(100, limit)));
}

export async function saveBotMemoryEmbedding(
  id: number,
  contentHash: string,
  embedding: number[],
) {
  const updated = await db
    .update(bot_memory_documents)
    .set({
      embedding,
      embedding_model: aiModel("OLLAMA_EMBED"),
      updated_at: new Date(),
    })
    .where(and(
      eq(bot_memory_documents.id, id),
      eq(bot_memory_documents.content_hash, contentHash),
      isNull(bot_memory_documents.deleted_at),
    ))
    .returning({ id: bot_memory_documents.id });
  return updated.length > 0;
}

type RankedRow = Omit<BotMemorySearchResult, "relevance" | "semanticRank" | "lexicalRank">;

/** RRFは異なる尺度のsemantic/lexical scoreを直接足さず、順位だけを安定して統合する。 */
export function mergeBotMemoryRanks(
  semanticRows: RankedRow[],
  lexicalRows: RankedRow[],
  limit: number,
  k = 60,
): BotMemorySearchResult[] {
  const merged = new Map<number, BotMemorySearchResult>();
  const add = (row: RankedRow, rank: number, kind: "semantic" | "lexical") => {
    const current = merged.get(row.id) ?? { ...row, relevance: 0 };
    current.relevance += 1 / (k + rank);
    if (kind === "semantic") current.semanticRank = rank;
    else current.lexicalRank = rank;
    merged.set(row.id, current);
  };
  semanticRows.forEach((row, i) => add(row, i + 1, "semantic"));
  lexicalRows.forEach((row, i) => add(row, i + 1, "lexical"));
  return [...merged.values()]
    .sort((a, b) => b.relevance - a.relevance || b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, limit);
}

function searchConditions(request: BotMemorySearchRequest) {
  return [
    isNull(bot_memory_documents.deleted_at),
    ...(request.sources?.length
      ? [inArray(bot_memory_documents.source_type, request.sources)]
      : []),
    ...(request.authorId ? [eq(bot_memory_documents.author_id, request.authorId)] : []),
    ...(request.excludeAuthorId ? [ne(bot_memory_documents.author_id, request.excludeAuthorId)] : []),
    ...(request.since ? [gte(bot_memory_documents.occurred_at, request.since)] : []),
    ...(request.until ? [lt(bot_memory_documents.occurred_at, request.until)] : []),
    ...(request.excludeDocumentIds?.length
      ? [notInArray(bot_memory_documents.id, request.excludeDocumentIds)]
      : []),
  ];
}

function toRanked(row: any): RankedRow {
  return {
    id: row.id,
    sourceType: row.sourceType as BotMemorySourceType,
    sourceId: row.sourceId,
    sourceUri: row.sourceUri,
    authorId: row.authorId,
    content: row.content,
    botResponse: row.botResponse,
    occurredAt: row.occurredAt instanceof Date ? row.occurredAt : new Date(row.occurredAt),
    affirmationScore: row.affirmationScore,
    metadata: row.metadata as Record<string, unknown> | null,
  };
}

const selection = {
  id: bot_memory_documents.id,
  sourceType: bot_memory_documents.source_type,
  sourceId: bot_memory_documents.source_id,
  sourceUri: bot_memory_documents.source_uri,
  authorId: bot_memory_documents.author_id,
  content: bot_memory_documents.content,
  botResponse: bot_memory_documents.bot_response,
  occurredAt: bot_memory_documents.occurred_at,
  affirmationScore: bot_memory_documents.affirmation_score,
  metadata: bot_memory_documents.metadata,
};

export async function searchBotMemory(
  request: BotMemorySearchRequest,
  deps: { embed?: typeof generateEmbedding } = {},
): Promise<BotMemorySearchResult[]> {
  const query = request.query.trim();
  if (!query) return [];
  const limit = Math.max(1, Math.min(20, request.limit ?? 10));
  const candidateLimit = Math.max(30, limit * 3);
  const base = searchConditions(request);
  const embedding = await (deps.embed ?? generateEmbedding)(query);

  const [semanticRows, lexicalRows] = await Promise.all([
    embedding
      ? (() => {
          const vec = sql`${`[${embedding.join(",")}]`}::vector`;
          return db
            .select(selection)
            .from(bot_memory_documents)
            .where(and(...base, sql`${bot_memory_documents.embedding} is not null`))
            .orderBy(sql`${bot_memory_documents.embedding} <=> ${vec}`)
            .limit(candidateLimit);
        })()
      : Promise.resolve([]),
    db
      .select(selection)
      .from(bot_memory_documents)
      .where(and(
        ...base,
        sql`(${bot_memory_documents.content} ilike ${`%${query}%`} or similarity(${bot_memory_documents.content}, ${query}) > 0.1)`,
      ))
      .orderBy(sql`similarity(${bot_memory_documents.content}, ${query}) desc`, desc(bot_memory_documents.occurred_at))
      .limit(candidateLimit),
  ]);

  return mergeBotMemoryRanks(
    semanticRows.map(toRanked),
    lexicalRows.map(toRanked),
    limit,
  );
}

export async function recordBotMemoryUsages(
  documentIds: number[],
  purpose: BotMemoryPurpose,
  outputRef?: string,
) {
  const uniqueIds = [...new Set(documentIds.filter(Number.isInteger))];
  if (!uniqueIds.length) return;
  await db.insert(bot_memory_usages).values(uniqueIds.map((documentId) => ({
    document_id: documentId,
    purpose,
    output_ref: outputRef ?? null,
  })));
}

export async function getRecentlyUsedBotMemoryDocumentIds(
  purpose: BotMemoryPurpose,
  since: Date,
) {
  const rows = await db
    .select({ documentId: bot_memory_usages.document_id })
    .from(bot_memory_usages)
    .where(and(
      eq(bot_memory_usages.purpose, purpose),
      gte(bot_memory_usages.used_at, since),
    ));
  return [...new Set(rows.map((row) => row.documentId))];
}
