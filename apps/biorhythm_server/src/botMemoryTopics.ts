import {
  getRecentlyUsedBotMemoryDocumentIds,
  searchBotMemory,
  type BotMemorySearchResult,
  type BotMemorySourceType,
} from "@bsky-affirmative-bot/database";
import type { BotContext } from "@bsky-affirmative-bot/shared-configs";

export interface BotMemoryTopicCandidate {
  id: number;
  source: BotMemorySourceType;
  content: string;
  occurredAt: string;
}

export function buildBotMemoryTopicQuery(input: {
  currentMood: string;
  botContext?: BotContext;
  unreadReplies?: string[];
}) {
  return [
    input.currentMood,
    ...(input.botContext?.recentActivities?.slice(-3).map((item) => item.activity) ?? []),
    ...(input.unreadReplies?.slice(0, 5) ?? []),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 1_000);
}

function grams(text: string) {
  const normalized = text.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  const values = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) values.add(normalized.slice(i, i + 2));
  return values;
}

function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/** 永続クラスタを作らず、その実行で得た少数候補だけを軽くまとめて順位づけする。 */
export function selectBotMemoryTopics(
  rows: BotMemorySearchResult[],
  usedDocumentIds: Iterable<number>,
  now = new Date(),
) {
  const used = new Set(usedDocumentIds);
  const unique = [...new Map(rows.map((row) => [row.id, row])).values()]
    .filter((row) => !used.has(row.id));
  const rowGrams = new Map(unique.map((row) => [row.id, grams(row.content)]));
  const scored = unique.map((row) => {
    const relatedSources = new Set<BotMemorySourceType>([row.sourceType]);
    for (const other of unique) {
      if (other.id === row.id) continue;
      if (similarity(rowGrams.get(row.id)!, rowGrams.get(other.id)!) >= 0.2) {
        relatedSources.add(other.sourceType);
      }
    }
    const ageHours = Math.max(0, (now.getTime() - row.occurredAt.getTime()) / 3_600_000);
    const freshness = Math.max(0, 1 - ageHours / (24 * 7));
    const affirmation = Math.max(0, Math.min(1, (row.affirmationScore ?? 0) / 100));
    const score = row.relevance * 30 + freshness + affirmation * 0.5 +
      Math.min(3, relatedSources.size) * 0.35;
    return { row, score };
  }).sort((a, b) => b.score - a.score || b.row.occurredAt.getTime() - a.row.occurredAt.getTime());

  const counts = new Map<BotMemorySourceType, number>();
  const selected: BotMemoryTopicCandidate[] = [];
  for (const { row } of scored) {
    if ((counts.get(row.sourceType) ?? 0) >= 2) continue;
    selected.push({
      id: row.id,
      source: row.sourceType,
      content: row.content,
      occurredAt: row.occurredAt.toISOString(),
    });
    counts.set(row.sourceType, (counts.get(row.sourceType) ?? 0) + 1);
    if (selected.length >= 10) break;
  }
  return selected;
}

export async function retrieveBotMemoryTopics(input: {
  query: string;
  now?: Date;
}, deps: {
  search?: typeof searchBotMemory;
  getUsedIds?: typeof getRecentlyUsedBotMemoryDocumentIds;
} = {}) {
  const query = input.query.trim();
  if (!query) return [];
  const now = input.now ?? new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 3_600_000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3_600_000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3_600_000);
  const search = deps.search ?? searchBotMemory;
  const getUsedIds = deps.getUsedIds ?? getRecentlyUsedBotMemoryDocumentIds;
  const [recent, usedIds] = await Promise.all([
    search({ query, purpose: "scheduled_post", since: oneDayAgo, limit: 20 }),
    getUsedIds("scheduled_post", fourteenDaysAgo),
  ]);
  const older = await search({
    query,
    purpose: "scheduled_post",
    since: sevenDaysAgo,
    until: oneDayAgo,
    excludeDocumentIds: recent.map((row) => row.id),
    limit: 20,
  });
  return selectBotMemoryTopics([...recent, ...older], usedIds, now);
}
