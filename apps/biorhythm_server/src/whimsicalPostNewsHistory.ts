import { MemoryService } from "@bsky-affirmative-bot/clients";

// This is bot-life memory used only by whimsical post generation, not news-feed state.
export const RECENT_NEWS_STATE_KEY = "recent_positive_news_articles";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECENT_ARTICLES = 100;

export interface RecentNewsUse {
  articleId: string;
  usedAt: string;
}

export function normalizeRecentNewsUses(value: unknown, now = Date.now()): RecentNewsUse[] {
  if (!Array.isArray(value)) return [];
  const cutoff = now - RETENTION_MS;
  const seen = new Set<string>();
  const normalized: RecentNewsUse[] = [];

  for (const item of value) {
    const articleId = typeof item === "string"
      ? item.trim()
      : item && typeof item === "object" && typeof (item as any).articleId === "string"
        ? (item as any).articleId.trim()
        : "";
    const usedAt = item && typeof item === "object" && typeof (item as any).usedAt === "string"
      ? (item as any).usedAt
      : new Date(now).toISOString();
    const usedAtMs = Date.parse(usedAt);
    if (!articleId || !Number.isFinite(usedAtMs) || usedAtMs < cutoff || seen.has(articleId)) {
      continue;
    }
    seen.add(articleId);
    normalized.push({ articleId, usedAt: new Date(usedAtMs).toISOString() });
  }

  return normalized
    .sort((a, b) => Date.parse(b.usedAt) - Date.parse(a.usedAt))
    .slice(0, MAX_RECENT_ARTICLES);
}

export async function getRecentNewsArticleIds(): Promise<string[]> {
  const state = await MemoryService.getBotState(RECENT_NEWS_STATE_KEY);
  return normalizeRecentNewsUses(state).map((item) => item.articleId);
}

export async function recordRecentNewsArticle(articleId: string): Promise<void> {
  const normalizedId = articleId.trim();
  if (!normalizedId) return;

  const now = Date.now();
  const state = await MemoryService.getBotState(RECENT_NEWS_STATE_KEY);
  const recent = normalizeRecentNewsUses(state, now)
    .filter((item) => item.articleId !== normalizedId);
  recent.unshift({ articleId: normalizedId, usedAt: new Date(now).toISOString() });
  await MemoryService.setBotState(
    RECENT_NEWS_STATE_KEY,
    recent.slice(0, MAX_RECENT_ARTICLES),
  );
}
