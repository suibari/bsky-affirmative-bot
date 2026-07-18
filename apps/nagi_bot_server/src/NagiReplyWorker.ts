import { and, asc, eq, lte, or } from "drizzle-orm";
import {
  db,
  nagiBotReplyJobs,
  nagiPostScores,
} from "@bsky-affirmative-bot/database";
import { createNagiReply } from "./createNagiReply.js";

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
      const result = await createNagiReply(job);

      await db.transaction(async (tx) => {
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

        await tx
          .update(nagiBotReplyJobs)
          .set({
            state: "posted",
            replyUri: result.uri,
            score: result.score,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(nagiBotReplyJobs.sourceUri, job.sourceUri));
      });
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
