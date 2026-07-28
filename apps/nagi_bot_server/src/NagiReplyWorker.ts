import { and, asc, eq, lte, or } from "drizzle-orm";
import {
  db,
  nagiBotReplyJobs,
  nagiPostScores,
} from "@bsky-affirmative-bot/database";
import {
  SUPER_POSITIVE_SCORE_THRESHOLD,
  awardSuperPositiveLevel,
} from "@bsky-affirmative-bot/clients";
import { createNagiReply } from "./createNagiReply.js";
import {
  decideNagiReplyMode,
  NagiAiQuotaExceededError,
  reserveNagiAiRequest,
  switchNagiReplyToTemplate,
} from "./nagiAiQuota.js";

const MAX_ATTEMPTS = 5;
const LEASE_DURATION_MS = 120_000;
const WORKER_INTERVAL_MS = 2_000;
const MAX_BACKOFF_MS = 300_000;

let running = false;

export function startNagiReplyWorker() {
  if (running) {
    return;
  }

  if (!/^did:(plc|web):/.test(process.env.NAGI_BOT_DID ?? "")) {
    throw new Error("NAGI_BOT_DID must be an AT Protocol DID");
  }

  running = true;

  const run = async () => {
    const now = new Date();
    const jobs = await db
      .select()
      .from(nagiBotReplyJobs)
      .where(
        and(
          or(
            eq(nagiBotReplyJobs.state, "pending"),
            eq(nagiBotReplyJobs.state, "processing"),
          ),
          lte(nagiBotReplyJobs.nextAttemptAt, now),
          or(
            eq(nagiBotReplyJobs.state, "pending"),
            lte(nagiBotReplyJobs.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(asc(nagiBotReplyJobs.nextAttemptAt))
      .limit(1);

    const job = jobs[0];
    if (!job) {
      return;
    }

    await db
      .update(nagiBotReplyJobs)
      .set({
        state: "processing",
        leaseExpiresAt: new Date(Date.now() + LEASE_DURATION_MS),
        attempts: job.attempts + 1,
        updatedAt: now,
      })
      .where(eq(nagiBotReplyJobs.sourceUri, job.sourceUri));

    try {
      const decision = await decideNagiReplyMode(job.sourceUri, job.authorDid);
      let result;
      try {
        result = await createNagiReply(job, {
          mode: decision.mode,
          beforeGeminiRequest:
            decision.mode === "ai" ? reserveNagiAiRequest : undefined,
        });
      } catch (error) {
        if (!(error instanceof NagiAiQuotaExceededError)) throw error;
        await switchNagiReplyToTemplate(job.sourceUri, error.reason);
        result = await createNagiReply(job, { mode: "template" });
      }

      await db.transaction(async (tx) => {
        // 会話モードの返信はスコアを持たないので post_scores には積まない。
        // botReply の紐付けは bot_reply_jobs.reply_uri 側で維持される。
        if (result.score !== undefined) {
          await tx
            .insert(nagiPostScores)
            .values({
              postUri: job.sourceUri,
              score: result.score,
              botReplyUri: result.uri,
            })
            .onConflictDoUpdate({
              target: nagiPostScores.postUri,
              set: {
                score: result.score,
                botReplyUri: result.uri,
                updatedAt: new Date(),
              },
            });
        }

        await tx
          .update(nagiBotReplyJobs)
          .set({
            state: "posted",
            replyUri: result.uri,
            score: result.score ?? null,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(nagiBotReplyJobs.sourceUri, job.sourceUri));
      });

      // 超ポジティブLvはBlueskyと共通のカウンタ（followers.positivity_level）。
      // ジョブは既に posted なので、ここでの失敗はログのみ（リトライで二重加算させない）。
      if (
        result.score !== undefined &&
        result.score >= SUPER_POSITIVE_SCORE_THRESHOLD
      ) {
        try {
          await awardSuperPositiveLevel(job.authorDid);
        } catch (error) {
          console.error(
            `[ERROR][BADGE] Failed to award positivity level for ${job.authorDid}:`,
            error,
          );
        }
      }
    } catch (error) {
      const attempts = job.attempts + 1;
      const backoffMs = Math.min(MAX_BACKOFF_MS, 2 ** attempts * 5_000);

      await db
        .update(nagiBotReplyJobs)
        .set({
          state: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          lastError: error instanceof Error ? error.message : String(error),
          leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + backoffMs),
          updatedAt: new Date(),
        })
        .where(eq(nagiBotReplyJobs.sourceUri, job.sourceUri));
    }
  };

  setInterval(() => {
    void run().catch(console.error);
  }, WORKER_INTERVAL_MS);
}
