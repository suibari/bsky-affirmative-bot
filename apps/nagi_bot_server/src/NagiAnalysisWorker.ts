import { and, asc, eq, lte, or } from "drizzle-orm";
import { db, nagiAnalysisJobs } from "@bsky-affirmative-bot/database";
import { runNagiAnalysis } from "./NagiAnalysisFeature.js";

const MAX_ATTEMPTS = 5;
const LEASE_DURATION_MS = 120_000;
// 分析は Gemini + 外部読み出しを伴い頻度も低いので、返信ワーカーより緩めに回す。
const WORKER_INTERVAL_MS = 10_000;
const MAX_BACKOFF_MS = 300_000;

let running = false;

/** 自動分析のリースワーカー（NagiReplyWorker と同じ Postgres リースキュー方式）。 */
export function startNagiAnalysisWorker() {
  if (running) return;
  running = true;

  const run = async () => {
    const now = new Date();
    const jobs = await db
      .select()
      .from(nagiAnalysisJobs)
      .where(
        and(
          or(
            eq(nagiAnalysisJobs.state, "pending"),
            eq(nagiAnalysisJobs.state, "processing"),
          ),
          lte(nagiAnalysisJobs.nextAttemptAt, now),
          or(
            eq(nagiAnalysisJobs.state, "pending"),
            lte(nagiAnalysisJobs.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(asc(nagiAnalysisJobs.nextAttemptAt))
      .limit(1);

    const job = jobs[0];
    if (!job) return;

    await db
      .update(nagiAnalysisJobs)
      .set({
        state: "processing",
        leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS),
        attempts: job.attempts + 1,
        updatedAt: now,
      })
      .where(eq(nagiAnalysisJobs.id, job.id));

    try {
      await runNagiAnalysis({
        did: job.did,
        source: job.source,
        postCountAt: job.postCountAt,
      });

      await db
        .update(nagiAnalysisJobs)
        .set({
          state: "posted",
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(nagiAnalysisJobs.id, job.id));
    } catch (error) {
      const attempts = job.attempts + 1;
      const backoffMs = Math.min(MAX_BACKOFF_MS, 2 ** attempts * 5_000);
      await db
        .update(nagiAnalysisJobs)
        .set({
          state: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          lastError: error instanceof Error ? error.message : String(error),
          leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + backoffMs),
          updatedAt: new Date(),
        })
        .where(eq(nagiAnalysisJobs.id, job.id));
    }
  };

  setInterval(() => {
    void run().catch(console.error);
  }, WORKER_INTERVAL_MS);
}
