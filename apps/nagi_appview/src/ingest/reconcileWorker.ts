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
      fullQueue = shuffle(await listReconcileDids());
      nextSweepAt = now + config.reconcileIntervalMinutes * 60_000;
      console.log("[INFO][reconcile] Full sweep queued", {
        repositories: fullQueue.length,
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

  while (inFlight.size < config.reconcileConcurrency) {
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
