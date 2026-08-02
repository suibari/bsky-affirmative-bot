import { createHash } from "node:crypto";
import {
  db,
  nagiNews,
  nagiNewsApprovals,
  nagiNewsReviewJobs,
} from "@bsky-affirmative-bot/database";
import { type MyNewsSubmissions, type NewsSubmissionPreview } from "@bsky-affirmative-bot/nagi-lexicon";
import { getNewsMetadata } from "@bsky-affirmative-bot/nagi-linkcard";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { config } from "../config.js";
import { ensurePdsRecord } from "../ingest/reconcileRepo.js";
import { ApiError } from "../middleware/errors.js";
import { toApiError } from "../util/linkCardError.js";
import { jstDayStart, normalizeNewsUrl, validateNewsReviewSubject } from "./userNewsSubmissionPolicy.js";

const articleIdFor = (normalizedUrl: string) =>
  `user:${createHash("sha256").update(normalizedUrl).digest("hex")}`;

export async function getNewsSubmissionPreview(rawUrl: string): Promise<NewsSubmissionPreview> {
  const metadata = await toApiError(() => getNewsMetadata(rawUrl));
  const normalizedUrl = normalizeNewsUrl(metadata.uri);
  const duplicate = await db
    .select({ uri: nagiNews.uri })
    .from(nagiNews)
    .innerJoin(
      nagiNewsApprovals,
      and(
        eq(nagiNewsApprovals.newsUri, nagiNews.uri),
        eq(nagiNewsApprovals.newsCid, nagiNews.cid),
      ),
    )
    .where(
      and(
        eq(nagiNews.normalizedUrl, normalizedUrl),
        eq(nagiNewsApprovals.status, "approved"),
        isNull(nagiNews.deletedAt),
      ),
    )
    .limit(1);
  if (duplicate.length)
    throw new ApiError(409, "duplicate_news", "This article has already been added");
  const parsed = new URL(normalizedUrl);
  return {
    articleId: articleIdFor(normalizedUrl),
    url: normalizedUrl,
    title: metadata.title,
    sourceName: metadata.siteName ?? parsed.hostname,
    sourceUrl: parsed.origin,
    ...(metadata.publishedAt ? { publishedAt: metadata.publishedAt } : {}),
    ...(metadata.image ? { image: metadata.image } : {}),
  };
}

export async function requestNewsReview(
  viewerDid: string,
  subject: { uri: string; cid: string },
) {
  const parsed = validateNewsReviewSubject(viewerDid, subject);

  let current: Awaited<ReturnType<typeof ensurePdsRecord>>;
  try {
    current = await ensurePdsRecord(parsed.did, parsed.collection, parsed.rkey);
  } catch {
    throw new ApiError(409, "invalid_record", "News record could not be verified on the PDS");
  }
  if (current.uri !== subject.uri || current.cid !== subject.cid)
    throw new ApiError(409, "invalid_record", "News record CID does not match");

  const [news] = await db
    .select()
    .from(nagiNews)
    .where(and(eq(nagiNews.uri, subject.uri), eq(nagiNews.cid, subject.cid), isNull(nagiNews.deletedAt)))
    .limit(1);
  if (!news || news.did !== viewerDid)
    throw new ApiError(409, "invalid_record", "News record is not indexed");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${viewerDid}))`);
    const [existing] = await tx
      .select({ status: nagiNewsReviewJobs.status })
      .from(nagiNewsReviewJobs)
      .where(and(eq(nagiNewsReviewJobs.newsUri, subject.uri), eq(nagiNewsReviewJobs.newsCid, subject.cid)))
      .limit(1);
    if (existing) return { status: existing.status };

    const now = new Date();
    const [usage] = await tx
      .select({ value: count() })
      .from(nagiNewsReviewJobs)
      .where(and(eq(nagiNewsReviewJobs.did, viewerDid), gte(nagiNewsReviewJobs.requestedAt, jstDayStart(now))));
    if (Number(usage?.value ?? 0) >= config.userNewsDailyLimit)
      throw new ApiError(429, "news_daily_limit", "Daily news submission limit reached");

    await tx.insert(nagiNewsReviewJobs).values({
      newsUri: subject.uri,
      newsCid: subject.cid,
      did: viewerDid,
      normalizedUrl: normalizeNewsUrl(news.url),
      requestedAt: now,
    });
    return { status: "pending" as const };
  });
}

export async function getMyNewsSubmissions(viewerDid: string, limit: number): Promise<MyNewsSubmissions> {
  const rows = await db
    .select({ job: nagiNewsReviewJobs, news: nagiNews })
    .from(nagiNewsReviewJobs)
    .innerJoin(nagiNews, eq(nagiNews.uri, nagiNewsReviewJobs.newsUri))
    .where(eq(nagiNewsReviewJobs.did, viewerDid))
    .orderBy(desc(nagiNewsReviewJobs.requestedAt))
    .limit(Math.min(20, Math.max(1, limit)));
  return {
    items: rows.map(({ job, news }) => ({
      uri: job.newsUri,
      cid: job.newsCid,
      url: news.url,
      title: news.titleJa,
      status: job.status,
      ...(job.reasonCode ? { reasonCode: job.reasonCode } : {}),
      requestedAt: job.requestedAt.toISOString(),
      ...(job.finishedAt ? { finishedAt: job.finishedAt.toISOString() } : {}),
    })),
  };
}
