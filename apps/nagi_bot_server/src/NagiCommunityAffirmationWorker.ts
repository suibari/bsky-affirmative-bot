import {
  db,
  nagiActors,
  nagiCommunityAffirmations,
  nagiPosts,
  nagiReactions,
} from "@bsky-affirmative-bot/database";
import {
  COMMUNITY_AFFIRMATION_PROMPT_VERSION,
  generateCommunityAffirmation,
  type CommunityAffirmationInput,
} from "@bsky-affirmative-bot/bot-brain";
import {
  blobImagesToImageRefs,
  resolvePdsUrl,
} from "@bsky-affirmative-bot/bot-runtime";
import { MODEL_GEMINI } from "@bsky-affirmative-bot/shared-configs";
import { and, asc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";

const ONE_HOUR_MS = 60 * 60 * 1_000;
const SEVEN_DAYS_MS = 7 * 24 * ONE_HOUR_MS;
const LEASE_MS = 120_000;
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 300_000;
const WORKER_INTERVAL_MS = 10_000;
const CANDIDATE_REFRESH_MS = 60_000;
const LOG_PREFIX = "[community-affirmation]";

const logCommunityAffirmation = (
  event: string,
  details: Record<string, unknown> = {},
) => console.info(LOG_PREFIX, { event, ...details });

type Candidate = {
  post: typeof nagiPosts.$inferSelect;
  pdsUrl: string | null;
  reactionCount: number;
};

const textHasContentWarning = (text: string) => {
  let markers = 0;
  let inCode = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === "`") {
      inCode = !inCode;
      continue;
    }
    if (!inCode && text.startsWith("||", index)) {
      markers += 1;
      index += 1;
    }
  }
  return markers === 2;
};

export function hasCommunityAffirmationContentWarning(
  post: Pick<
    typeof nagiPosts.$inferSelect,
    "text" | "recordJson" | "embedImages"
  >,
) {
  const record = post.recordJson as any;
  const images = (post.embedImages ?? record?.embed?.images) as
    Array<{ contentWarning?: boolean }> | undefined;
  return (
    record?.cwRestricted === true ||
    textHasContentWarning(post.text) ||
    Boolean(images?.some((image) => image?.contentWarning === true))
  );
}

export function canReplaceCommunityCandidate(
  existing:
    | { state: string; nextEligibleAt: Date; promptVersion?: string | null }
    | undefined,
  now: Date,
) {
  return (
    !existing ||
    ((existing.state === "posted" || existing.state === "rejected") &&
      existing.promptVersion !== COMMUNITY_AFFIRMATION_PROMPT_VERSION) ||
    (existing.state !== "processing" &&
      existing.nextEligibleAt.getTime() <= now.getTime())
  );
}

export function chooseCommunityCandidate(
  candidates: Candidate[],
  existing?: { sourceUri: string; sourceCid: string },
) {
  return candidates.find(
    ({ post }) =>
      !existing ||
      post.uri !== existing.sourceUri ||
      post.cid !== existing.sourceCid,
  );
}

export function communityAffirmationRetry(attempts: number) {
  return {
    failed: attempts >= MAX_ATTEMPTS,
    backoffMs: Math.min(MAX_BACKOFF_MS, 2 ** attempts * 5_000),
  };
}

async function eligibleCandidates(now: Date): Promise<Candidate[]> {
  const rows = await db
    .select({
      post: nagiPosts,
      pdsUrl: nagiActors.pdsUrl,
      reactionCount: sql<number>`(
        select count(*)::int
        from nagi.reactions as community_reaction
        where community_reaction.subject_uri = ${nagiPosts.uri}
      )`,
    })
    .from(nagiPosts)
    .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
    .where(
      and(
        isNull(nagiPosts.deletedAt),
        isNull(nagiPosts.replyParentUri),
        ne(nagiPosts.did, process.env.NAGI_BOT_DID!),
        lte(nagiPosts.recordCreatedAt, new Date(now.getTime() - ONE_HOUR_MS)),
        gte(nagiPosts.recordCreatedAt, new Date(now.getTime() - SEVEN_DAYS_MS)),
        sql`(
          select count(*)
          from nagi.reactions as community_reaction
          where community_reaction.subject_uri = ${nagiPosts.uri}
        ) <= 1`,
      ),
    )
    .orderBy(
      sql`(
        select count(*)
        from nagi.reactions as community_reaction
        where community_reaction.subject_uri = ${nagiPosts.uri}
      )`,
      asc(nagiPosts.recordCreatedAt),
      asc(nagiPosts.uri),
    );

  return rows
    .map((row) => ({ ...row, reactionCount: Number(row.reactionCount) }))
    .filter(({ post }) => !hasCommunityAffirmationContentWarning(post));
}

async function refreshCandidates(now: Date) {
  const byAuthor = new Map<string, Candidate[]>();
  for (const candidate of await eligibleCandidates(now)) {
    const group = byAuthor.get(candidate.post.did) ?? [];
    group.push(candidate);
    byAuthor.set(candidate.post.did, group);
  }
  for (const [authorDid, candidates] of byAuthor) {
    const existing = await db
      .select({
        sourceUri: nagiCommunityAffirmations.sourceUri,
        sourceCid: nagiCommunityAffirmations.sourceCid,
        nextEligibleAt: nagiCommunityAffirmations.nextEligibleAt,
        state: nagiCommunityAffirmations.state,
        promptVersion: nagiCommunityAffirmations.promptVersion,
      })
      .from(nagiCommunityAffirmations)
      .where(eq(nagiCommunityAffirmations.authorDid, authorDid))
      .limit(1);
    if (!canReplaceCommunityCandidate(existing[0], now)) continue;
    const promptUpgrade =
      (existing[0]?.state === "posted" || existing[0]?.state === "rejected") &&
      existing[0].promptVersion !== COMMUNITY_AFFIRMATION_PROMPT_VERSION;
    const sameSource = promptUpgrade
      ? candidates.find(
          ({ post }) =>
            post.uri === existing[0].sourceUri &&
            post.cid === existing[0].sourceCid,
        )
      : undefined;
    const candidate =
      sameSource ?? chooseCommunityCandidate(candidates, existing[0]);
    if (!candidate) continue;
    const nextEligibleAt = new Date(now.getTime() + 24 * ONE_HOUR_MS);

    await db
      .insert(nagiCommunityAffirmations)
      .values({
        authorDid: candidate.post.did,
        sourceUri: candidate.post.uri,
        sourceCid: candidate.post.cid,
        state: "pending",
        attempts: 0,
        nextAttemptAt: now,
        nextEligibleAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: nagiCommunityAffirmations.authorDid,
        set: {
          sourceUri: candidate.post.uri,
          sourceCid: candidate.post.cid,
          summaryJa: null,
          summaryEn: null,
          state: "pending",
          attempts: 0,
          leaseExpiresAt: null,
          nextAttemptAt: now,
          nextEligibleAt,
          lastError: null,
          model: null,
          promptVersion: null,
          createdAt: now,
          updatedAt: now,
        },
      });
    logCommunityAffirmation("candidate_queued", {
      authorDid,
      sourceUri: candidate.post.uri,
      sourceCid: candidate.post.cid,
      reason: promptUpgrade ? "prompt_upgrade" : "scheduled",
      promptVersion: COMMUNITY_AFFIRMATION_PROMPT_VERSION,
    });
  }
}

async function loadInput(
  job: typeof nagiCommunityAffirmations.$inferSelect,
): Promise<CommunityAffirmationInput | undefined> {
  const now = new Date();
  const [source] = await db
    .select({
      post: nagiPosts,
      pdsUrl: nagiActors.pdsUrl,
      reactionCount: sql<number>`(
        select count(*)::int
        from nagi.reactions as community_reaction
        where community_reaction.subject_uri = ${nagiPosts.uri}
      )`,
    })
    .from(nagiPosts)
    .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
    .where(
      and(
        eq(nagiPosts.uri, job.sourceUri),
        eq(nagiPosts.cid, job.sourceCid),
        isNull(nagiPosts.deletedAt),
        isNull(nagiPosts.replyParentUri),
        ne(nagiPosts.did, process.env.NAGI_BOT_DID!),
        lte(nagiPosts.recordCreatedAt, new Date(now.getTime() - ONE_HOUR_MS)),
        gte(nagiPosts.recordCreatedAt, new Date(now.getTime() - SEVEN_DAYS_MS)),
      ),
    )
    .limit(1);
  if (
    !source ||
    Number(source.reactionCount) > 1 ||
    hasCommunityAffirmationContentWarning(source.post)
  )
    return undefined;

  const record = source.post.recordJson as any;
  const pdsUrl =
    source.pdsUrl ?? (await resolvePdsUrl(source.post.did).catch(() => ""));
  if (
    Array.isArray(source.post.embedImages) &&
    source.post.embedImages.length &&
    !pdsUrl
  )
    throw new Error("Failed to resolve the source PDS for attached images");
  const images: NonNullable<CommunityAffirmationInput["images"]> =
    blobImagesToImageRefs(
      source.post.did,
      pdsUrl,
      source.post.embedImages as any,
    ).map((image) => ({ ...image, origin: "direct" as const }));

  let quoteText: string | undefined;
  if (source.post.quoteUri) {
    const [quote] = await db
      .select({ post: nagiPosts, pdsUrl: nagiActors.pdsUrl })
      .from(nagiPosts)
      .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
      .where(
        and(
          eq(nagiPosts.uri, source.post.quoteUri),
          isNull(nagiPosts.deletedAt),
        ),
      )
      .limit(1);
    // 引用元を取得できない、または引用元にCWがある場合は、文脈を欠いた要約を作らない。
    if (!quote || hasCommunityAffirmationContentWarning(quote.post))
      return undefined;
    quoteText = quote.post.text;
    const quotePds =
      quote.pdsUrl ?? (await resolvePdsUrl(quote.post.did).catch(() => ""));
    if (
      Array.isArray(quote.post.embedImages) &&
      quote.post.embedImages.length &&
      !quotePds
    )
      throw new Error("Failed to resolve the quoted source PDS for images");
    images.push(
      ...blobImagesToImageRefs(
        quote.post.did,
        quotePds,
        quote.post.embedImages as any,
      ).map((image) => ({ ...image, origin: "quote" as const })),
    );
  }

  const linkCards = Array.isArray(record?.linkCards)
    ? record.linkCards.flatMap((card: any) =>
        typeof card?.title === "string" || typeof card?.description === "string"
          ? [
              {
                title: typeof card.title === "string" ? card.title : undefined,
                description:
                  typeof card.description === "string"
                    ? card.description
                    : undefined,
              },
            ]
          : [],
      )
    : undefined;
  if (
    !source.post.text.trim() &&
    !images.length &&
    !quoteText &&
    !linkCards?.length
  )
    return undefined;
  return {
    text: source.post.text,
    quoteText,
    linkCards,
    images,
  };
}

async function processOne(now: Date) {
  const [job] = await db
    .select()
    .from(nagiCommunityAffirmations)
    .where(
      and(
        or(
          eq(nagiCommunityAffirmations.state, "pending"),
          eq(nagiCommunityAffirmations.state, "processing"),
        ),
        lte(nagiCommunityAffirmations.nextAttemptAt, now),
        or(
          eq(nagiCommunityAffirmations.state, "pending"),
          lte(nagiCommunityAffirmations.leaseExpiresAt, now),
        ),
      ),
    )
    .orderBy(asc(nagiCommunityAffirmations.nextAttemptAt))
    .limit(1);
  if (!job) return;

  // 候補の読み取り後に同じ行を別プロセスが先にリースしていても、
  // availability条件が変わるため片方だけがreturningを得る。
  const [leasedJob] = await db
    .update(nagiCommunityAffirmations)
    .set({
      state: "processing",
      attempts: job.attempts + 1,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      updatedAt: now,
    })
    .where(
      and(
        eq(nagiCommunityAffirmations.authorDid, job.authorDid),
        eq(nagiCommunityAffirmations.sourceUri, job.sourceUri),
        eq(nagiCommunityAffirmations.sourceCid, job.sourceCid),
        eq(nagiCommunityAffirmations.attempts, job.attempts),
        or(
          eq(nagiCommunityAffirmations.state, "pending"),
          and(
            eq(nagiCommunityAffirmations.state, "processing"),
            lte(nagiCommunityAffirmations.leaseExpiresAt, now),
          ),
        ),
      ),
    )
    .returning();
  if (!leasedJob) return;
  logCommunityAffirmation("generation_started", {
    authorDid: leasedJob.authorDid,
    sourceUri: leasedJob.sourceUri,
    sourceCid: leasedJob.sourceCid,
    attempt: leasedJob.attempts,
    promptVersion: COMMUNITY_AFFIRMATION_PROMPT_VERSION,
  });

  try {
    const input = await loadInput(leasedJob);
    const result = input
      ? await generateCommunityAffirmation(input)
      : {
          publishable: false,
          summaryJa: "",
          summaryEn: "",
          reasonCode: "insufficient_context",
        };
    const updated = await db
      .update(nagiCommunityAffirmations)
      .set({
        state: result.publishable ? "posted" : "rejected",
        summaryJa: result.publishable ? result.summaryJa : null,
        summaryEn: result.publishable ? result.summaryEn : null,
        leaseExpiresAt: null,
        nextEligibleAt: new Date(Date.now() + 24 * ONE_HOUR_MS),
        lastError: result.publishable ? null : result.reasonCode,
        model: MODEL_GEMINI,
        promptVersion: COMMUNITY_AFFIRMATION_PROMPT_VERSION,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(nagiCommunityAffirmations.authorDid, leasedJob.authorDid),
          eq(nagiCommunityAffirmations.sourceUri, leasedJob.sourceUri),
          eq(nagiCommunityAffirmations.sourceCid, leasedJob.sourceCid),
          eq(nagiCommunityAffirmations.state, "processing"),
          eq(nagiCommunityAffirmations.attempts, leasedJob.attempts),
          eq(
            nagiCommunityAffirmations.leaseExpiresAt,
            leasedJob.leaseExpiresAt!,
          ),
        ),
      )
      .returning({ authorDid: nagiCommunityAffirmations.authorDid });
    if (updated.length)
      logCommunityAffirmation(
        result.publishable ? "generation_published" : "generation_rejected",
        {
          authorDid: leasedJob.authorDid,
          sourceUri: leasedJob.sourceUri,
          sourceCid: leasedJob.sourceCid,
          attempt: leasedJob.attempts,
          promptVersion: COMMUNITY_AFFIRMATION_PROMPT_VERSION,
          ...(result.publishable ? {} : { reasonCode: result.reasonCode }),
        },
      );
  } catch (error) {
    const attempts = leasedJob.attempts;
    const { failed, backoffMs } = communityAffirmationRetry(attempts);
    const updated = await db
      .update(nagiCommunityAffirmations)
      .set({
        state: failed ? "failed" : "pending",
        leaseExpiresAt: null,
        nextAttemptAt: new Date(Date.now() + backoffMs),
        nextEligibleAt: failed
          ? new Date(Date.now() + 24 * ONE_HOUR_MS)
          : leasedJob.nextEligibleAt,
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(nagiCommunityAffirmations.authorDid, leasedJob.authorDid),
          eq(nagiCommunityAffirmations.sourceUri, leasedJob.sourceUri),
          eq(nagiCommunityAffirmations.sourceCid, leasedJob.sourceCid),
          eq(nagiCommunityAffirmations.state, "processing"),
          eq(nagiCommunityAffirmations.attempts, leasedJob.attempts),
          eq(
            nagiCommunityAffirmations.leaseExpiresAt,
            leasedJob.leaseExpiresAt!,
          ),
        ),
      )
      .returning({ authorDid: nagiCommunityAffirmations.authorDid });
    if (updated.length)
      logCommunityAffirmation(
        failed ? "generation_failed" : "generation_retry_scheduled",
        {
          authorDid: leasedJob.authorDid,
          sourceUri: leasedJob.sourceUri,
          sourceCid: leasedJob.sourceCid,
          attempt: attempts,
          maxAttempts: MAX_ATTEMPTS,
          ...(failed ? {} : { nextAttemptInMs: backoffMs }),
          error:
            error instanceof Error
              ? error.message.slice(0, 500)
              : String(error).slice(0, 500),
        },
      );
  }
}

let running = false;
let lastCandidateRefresh = 0;

export function startNagiCommunityAffirmationWorker() {
  if (running) return;
  running = true;
  logCommunityAffirmation("worker_started", {
    workerIntervalMs: WORKER_INTERVAL_MS,
    candidateRefreshMs: CANDIDATE_REFRESH_MS,
    promptVersion: COMMUNITY_AFFIRMATION_PROMPT_VERSION,
  });
  const tick = async () => {
    const now = new Date();
    if (now.getTime() - lastCandidateRefresh >= CANDIDATE_REFRESH_MS) {
      lastCandidateRefresh = now.getTime();
      await refreshCandidates(now);
    }
    await processOne(now);
  };
  void tick().catch(console.error);
  setInterval(() => void tick().catch(console.error), WORKER_INTERVAL_MS);
}
