import { db } from "@bsky-affirmative-bot/database";
import { sql } from "drizzle-orm";
import { config } from "../config.js";
import { reconcileRepo } from "./reconcileRepo.js";

const PRIORITY_THROTTLE_MS = 15 * 60_000;
const RETRY_BASE_MS = 5 * 60_000;
const TICK_MS = 5_000;
const MAX_RETRIES = 3;

const priority = new Set<string>();
const lastSuccess = new Map<string, number>();
const retries = new Map<string, { attempts: number; retryAt: number }>();
const inFlight = new Map<string, Promise<void>>();
let fullQueue: string[] = [];
let nextSweepAt = Number.POSITIVE_INFINITY;
let timer: NodeJS.Timeout | undefined;
let stopped = true;
let activeTick: Promise<void> | undefined;
let degraded = false;

const sweepIntervalMs = () =>
  (degraded
    ? config.reconcileDegradedIntervalMinutes
    : config.reconcileIntervalMinutes) * 60_000;

const concurrency = () =>
  degraded
    ? Math.min(8, config.reconcileConcurrency * 2)
    : config.reconcileConcurrency;

/**
 * Jetstream が繋がらない間だけ、PDS 直読みの巡回を主経路に切り替える。
 *
 * 通常時の 6 時間巡回は「取りこぼしの最終保険」なので、firehose が死んでいる間は
 * それだと遅すぎる。degraded 中は間隔を詰め、並列度を上げ、直近アクティブな
 * リポジトリから先に見る。
 */
export function setIngestDegraded(next: boolean): void {
  if (degraded === next) return;
  degraded = next;
  console.warn("[WARN][reconcile] Ingest degraded state changed", {
    degraded,
    intervalMinutes: degraded
      ? config.reconcileDegradedIntervalMinutes
      : config.reconcileIntervalMinutes,
  });
  if (stopped) return;
  if (degraded) {
    // 切り替わった瞬間に一周させ、firehose が落ちている間の穴を最短で埋める。
    fullQueue = [];
    nextSweepAt = Date.now();
    scheduleTick();
  } else {
    nextSweepAt = Date.now() + sweepIntervalMs();
  }
}

const shuffle = <T>(values: T[]): T[] => {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
};

export function prioritizeReconcile(did: string): void {
  if (did) priority.add(did);
}

export async function listReconcileDids(): Promise<string[]> {
  const rows = (await db.execute(sql`
    select distinct did from (
      select did from nagi.actors
      union all select did from nagi.profiles
      union all select did from nagi.posts
      union all select did from nagi.reactions
      union all select did from nagi.channels
      union all select did from nagi.emojis
      union all select did from nagi.diaries
      union all select did from nagi.news
      union all select ${config.botDid}::text as did
    ) repos
    where did is not null and did <> ''
  `)) as unknown as Array<{ did: string }>;
  return [...new Set(rows.map((row) => row.did))];
}

/**
 * 直近に書き込みのあったリポジトリから順に並べる。degraded 中は一周が遅れるほど
 * 取りこぼしが表に出るので、動いている人を先に拾う。活動履歴の無い DID も末尾に残す。
 */
async function listActiveFirstDids(): Promise<string[]> {
  const rows = (await db.execute(sql`
    select did, max(at) as last_at from (
      select did, max(indexed_at) as at from nagi.posts group by did
      union all select did, max(indexed_at) as at from nagi.reactions group by did
      union all select did, max(indexed_at) as at from nagi.channels group by did
    ) activity
    where did is not null and did <> ''
    group by did
    order by last_at desc
  `)) as unknown as Array<{ did: string }>;
  const ordered = rows.map((row) => row.did);
  const seen = new Set(ordered);
  // 活動テーブルに出てこない DID（プロフィールだけの人・bot など）も必ず巡回対象に含める。
  for (const did of await listReconcileDids()) {
    if (!seen.has(did)) ordered.push(did);
  }
  return ordered;
}

async function runDid(did: string): Promise<void> {
  try {
    await reconcileRepo(did);
    lastSuccess.set(did, Date.now());
    retries.delete(did);
  } catch (error) {
    const previous = retries.get(did)?.attempts ?? 0;
    const attempts = previous + 1;
    console.error("[ERROR][reconcile] Repository reconciliation failed", {
      did,
      attempts,
      error,
    });
    if (attempts < MAX_RETRIES) {
      retries.set(did, {
        attempts,
        retryAt: Date.now() + RETRY_BASE_MS * 2 ** (attempts - 1),
      });
    } else {
      retries.delete(did);
    }
  }
}

async function tick(): Promise<void> {
  if (stopped) return;
  const now = Date.now();
  if (now >= nextSweepAt && fullQueue.length === 0) {
    try {
      fullQueue = degraded
        ? await listActiveFirstDids()
        : shuffle(await listReconcileDids());
      nextSweepAt = now + sweepIntervalMs();
      console.log("[INFO][reconcile] Full sweep queued", {
        repositories: fullQueue.length,
        degraded,
      });
    } catch (error) {
      console.error(
        "[ERROR][reconcile] Failed to build repository queue",
        error,
      );
      nextSweepAt = now + RETRY_BASE_MS;
    }
  }
  if (stopped) return;

  const retryReady = [...retries.entries()]
    .filter(([, state]) => state.retryAt <= now)
    .map(([did]) => did);
  const priorityReady = [...priority].filter(
    (did) => now - (lastSuccess.get(did) ?? 0) >= PRIORITY_THROTTLE_MS,
  );

  while (inFlight.size < concurrency()) {
    const did =
      retryReady.shift() ?? priorityReady.shift() ?? fullQueue.shift();
    if (!did) break;
    priority.delete(did);
    if (inFlight.has(did)) continue;
    const job = runDid(did).finally(() => inFlight.delete(did));
    inFlight.set(did, job);
  }
}

const scheduleTick = () => {
  if (stopped || activeTick) return;
  activeTick = tick().finally(() => {
    activeTick = undefined;
  });
};

export function startReconcileWorker() {
  if (!stopped) return;
  stopped = false;
  nextSweepAt = Date.now() + Math.floor(Math.random() * 5 * 60_000);
  timer = setInterval(scheduleTick, TICK_MS);
  scheduleTick();
}

export async function stopReconcileWorker(): Promise<void> {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = undefined;
  await activeTick;
  await Promise.allSettled(inFlight.values());
}
