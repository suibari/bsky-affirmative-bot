import { createHash } from "node:crypto";
import { db, nagiNews, nagiNewsApprovals, nagiNewsScreening, nagiNewsUpdateRuns } from "@bsky-affirmative-bot/database";
import { NagiNewsService } from "@bsky-affirmative-bot/clients";
import { getPositiveNewsCandidates, judgePositiveNewsBatch, POSITIVE_NEWS_PROMPT_VERSION } from "@bsky-affirmative-bot/bot-brain";
import { MODEL_GEMINI_HIGH } from "@bsky-affirmative-bot/shared-configs";
import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

const SIX_HOURS = 6 * 60 * 60 * 1000;
const RETRY_DELAY = 30 * 60 * 1000;
const JST_OFFSET = 9 * 60 * 60 * 1000;
// 1スロットで掲載する最大件数と、その日次上限（掲載数 / NewsDataクレジット）。
const MAX_PER_SLOT = 5;
const DAILY_PUBLISH_LIMIT = 20;
const DAILY_CREDIT_LIMIT = 20;

export function newsSlot(now = new Date()): Date {
  return new Date(Math.floor((now.getTime() + JST_OFFSET) / SIX_HOURS) * SIX_HOURS - JST_OFFSET);
}

function normalizedUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw); url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch { return undefined; }
}

async function claim(slot: Date): Promise<boolean> {
  const inserted = await db.insert(nagiNewsUpdateRuns).values({ slot, status: "running" }).onConflictDoNothing().returning({ slot: nagiNewsUpdateRuns.slot });
  if (inserted.length) return true;
  const retry = await db.update(nagiNewsUpdateRuns).set({ status: "running", retryCount: 1, startedAt: new Date(), lastError: null })
    .where(and(eq(nagiNewsUpdateRuns.slot, slot), eq(nagiNewsUpdateRuns.status, "failed"), eq(nagiNewsUpdateRuns.retryCount, 0), lt(nagiNewsUpdateRuns.finishedAt, new Date(Date.now() - RETRY_DELAY))))
    .returning({ slot: nagiNewsUpdateRuns.slot });
  return retry.length > 0;
}

export async function updatePositiveNews(now = new Date()): Promise<number> {
  const slot = newsSlot(now);
  if (!(await claim(slot))) return 0;
  let creditsUsed = 0;
  try {
    const dayStartMs = Math.floor((now.getTime() + JST_OFFSET) / 86_400_000) * 86_400_000 - JST_OFFSET;
    const countRows = await db.select({ count: sql<number>`coalesce(sum(${nagiNewsUpdateRuns.publishedCount}), 0)` }).from(nagiNewsUpdateRuns)
      .where(and(gt(nagiNewsUpdateRuns.slot, new Date(dayStartMs - 1)), lt(nagiNewsUpdateRuns.slot, new Date(dayStartMs + 86_400_000))));
    const remaining = Math.max(0, DAILY_PUBLISH_LIMIT - Number(countRows[0]?.count ?? 0));
    if (!remaining) {
      await db.update(nagiNewsUpdateRuns).set({ status: "complete", finishedAt: new Date() }).where(eq(nagiNewsUpdateRuns.slot, slot));
      return 0;
    }
    const creditRows = await db.select({ count: sql<number>`coalesce(sum(${nagiNewsUpdateRuns.newsDataCredits}), 0)` }).from(nagiNewsUpdateRuns)
      .where(and(gt(nagiNewsUpdateRuns.slot, new Date(dayStartMs - 1)), lt(nagiNewsUpdateRuns.slot, new Date(dayStartMs + 86_400_000))));
    const remainingCredits = Math.max(0, DAILY_CREDIT_LIMIT - Number(creditRows[0]?.count ?? 0));
    if (!remainingCredits) {
      await db.update(nagiNewsUpdateRuns).set({ status: "complete", finishedAt: new Date() }).where(eq(nagiNewsUpdateRuns.slot, slot));
      return 0;
    }
    // PDS作成後に承認保存だけ失敗したレコードは、次回再審査・再承認できるよう除外しない。
    const existing = await db.select({ articleId: nagiNews.articleId, normalizedUrl: nagiNews.normalizedUrl })
      .from(nagiNews).innerJoin(nagiNewsApprovals, and(eq(nagiNewsApprovals.newsUri, nagiNews.uri), eq(nagiNewsApprovals.newsCid, nagiNews.cid)))
      .where(and(isNull(nagiNews.deletedAt), eq(nagiNewsApprovals.status, "approved")));
    const recentRejected = await db.select({ articleId: nagiNewsScreening.articleId }).from(nagiNewsScreening).where(and(gt(nagiNewsScreening.expiresAt, now), eq(nagiNewsScreening.decision, "rejected_final")));
    const excluded = new Set([...existing.map((row) => row.articleId), ...recentRejected.map((row) => row.articleId)]);
    const result = await getPositiveNewsCandidates({ excludeArticleIds: excluded, maxPages: Math.min(3, remainingCredits) });
    creditsUsed = result.diagnostics.creditsUsed;
    const candidates = result.candidates.filter((item) => {
      const url = normalizedUrl(item.link);
      return url && !existing.some((row) => row.normalizedUrl === url);
    }).slice(0, Math.min(MAX_PER_SLOT, remaining));
    if (!candidates.length) {
      await db.update(nagiNewsUpdateRuns).set({ status: "complete", newsDataCredits: sql`${nagiNewsUpdateRuns.newsDataCredits} + ${creditsUsed}`, finishedAt: new Date() }).where(eq(nagiNewsUpdateRuns.slot, slot));
      return 0;
    }
    // 全候補を必ず1回のGeminiリクエストで審査する。
    const decisions = await judgePositiveNewsBatch(candidates);
    let published = 0;
    for (const decision of decisions) {
      const candidate = candidates.find((item) => item.articleId === decision.articleId)!;
      const cacheKey = createHash("sha256").update(`${POSITIVE_NEWS_PROMPT_VERSION}:${candidate.articleId}:${candidate.title}:${candidate.description ?? ""}`).digest("hex");
      await db.insert(nagiNewsScreening).values({ cacheKey, articleId: candidate.articleId, decision: decision.publishable ? "approved_final" : "rejected_final", reasonCode: decision.reasonCode, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) }).onConflictDoUpdate({ target: nagiNewsScreening.cacheKey, set: { decision: decision.publishable ? "approved_final" : "rejected_final", reasonCode: decision.reasonCode, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) } });
      if (!decision.publishable || !candidate.link || !normalizedUrl(candidate.link)) continue;
      try {
        const ref = await NagiNewsService.publish({ articleId: candidate.articleId, url: candidate.link, titleJa: candidate.title, sourceName: candidate.sourceName, sourceUrl: candidate.sourceUrl, publishedAt: candidate.publishedAt, createdAt: now.toISOString() });
        const snapshot = { snapshotArticleId: candidate.articleId, snapshotUrl: candidate.link, snapshotTitleJa: candidate.title,
          snapshotSourceName: candidate.sourceName ?? null, snapshotSourceUrl: candidate.sourceUrl ?? null,
          snapshotPublishedAt: candidate.publishedAt ? new Date(candidate.publishedAt) : null, snapshotCreatedAt: now };
        await db.insert(nagiNewsApprovals).values({ newsUri: ref.uri, newsCid: ref.cid, status: "approved", reasonCode: decision.reasonCode, botCommentJa: decision.botCommentJa, titleEn: decision.titleEn, botCommentEn: decision.botCommentEn, model: MODEL_GEMINI_HIGH, promptVersion: POSITIVE_NEWS_PROMPT_VERSION, ...snapshot }).onConflictDoUpdate({ target: [nagiNewsApprovals.newsUri, nagiNewsApprovals.newsCid], set: { status: "approved", reasonCode: decision.reasonCode, botCommentJa: decision.botCommentJa, titleEn: decision.titleEn, botCommentEn: decision.botCommentEn, model: MODEL_GEMINI_HIGH, promptVersion: POSITIVE_NEWS_PROMPT_VERSION, hiddenAt: null, ...snapshot } });
        published++;
      } catch (error) {
        console.error(`[ERROR][NEWS_FEED] Failed to publish article=${candidate.articleId}`, error);
      }
    }
    await db.delete(nagiNewsScreening).where(lt(nagiNewsScreening.expiresAt, now));
    await db.update(nagiNewsUpdateRuns).set({ status: "complete", publishedCount: published, newsDataCredits: sql`${nagiNewsUpdateRuns.newsDataCredits} + ${creditsUsed}`, finishedAt: new Date() }).where(eq(nagiNewsUpdateRuns.slot, slot));
    console.log(`[INFO][NEWS_FEED] slot=${slot.toISOString()} published=${published} pages=${result.diagnostics.pagesFetched}`);
    return published;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(nagiNewsUpdateRuns).set({ status: "failed", newsDataCredits: sql`${nagiNewsUpdateRuns.newsDataCredits} + ${creditsUsed}`, lastError: message.slice(0, 2000), finishedAt: new Date() }).where(eq(nagiNewsUpdateRuns.slot, slot));
    console.error(`[ERROR][NEWS_FEED] slot=${slot.toISOString()}`, error);
    return 0;
  }
}

export function schedulePositiveNewsUpdates() {
  void updatePositiveNews();
  const timer = setInterval(() => void updatePositiveNews(), 30 * 60 * 1000);
  timer.unref();
  return timer;
}
