import { MemoryService } from "@bsky-affirmative-bot/clients";

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_ENERGY_PER_COMMENT = 10;

export interface LiveCommentEnergyManager {
  readonly getLiveCommentEnergyCursor: number | null;
  initializeLiveCommentEnergyCursor(commentId: number): Promise<void>;
  addLiveCommentEnergy(amount: number, throughCommentId: number): Promise<void>;
}

export interface LiveCommentEnergySyncDependencies {
  getBatchAfter(afterId: number): Promise<{ count: number; maxId: number | null }>;
  logger?: Pick<Console, "info" | "error">;
}

export function createLiveCommentEnergySync(
  manager: LiveCommentEnergyManager,
  energyPerComment = DEFAULT_ENERGY_PER_COMMENT,
  dependencies: LiveCommentEnergySyncDependencies = {
    getBatchAfter: (afterId) => MemoryService.getLiveCommentBatchAfter(afterId),
  },
) {
  if (!Number.isSafeInteger(energyPerComment) || energyPerComment <= 0) {
    throw new Error(`BIORHYTHM_LIVE_COMMENT_ENERGY must be a positive integer`);
  }

  const logger = dependencies.logger ?? console;
  let inFlight: Promise<void> | null = null;

  const execute = async (): Promise<void> => {
    const cursor = manager.getLiveCommentEnergyCursor;
    if (cursor === null) {
      const baseline = await dependencies.getBatchAfter(0);
      const baselineId = baseline.maxId ?? 0;
      await manager.initializeLiveCommentEnergyCursor(baselineId);
      logger.info(
        `[INFO][LIVE_ENERGY] Initialized comment cursor at ${baselineId}; existing comments were not applied.`,
      );
      return;
    }

    const batch = await dependencies.getBatchAfter(cursor);
    if (batch.count === 0 || batch.maxId === null) return;

    const amount = batch.count * energyPerComment;
    await manager.addLiveCommentEnergy(amount, batch.maxId);
    logger.info(
      `[INFO][LIVE_ENERGY] Applied ${batch.count} comment(s), +${amount} internal energy, cursor=${batch.maxId}.`,
    );
  };

  const run = (): Promise<void> => {
    if (inFlight) return inFlight;
    inFlight = execute()
      .catch((error) => {
        logger.error("[ERROR][LIVE_ENERGY] Failed to sync live comments:", error);
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  return { run };
}

function readPositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function scheduleLiveCommentEnergySync(manager: LiveCommentEnergyManager): void {
  const intervalMs = readPositiveInteger(
    process.env.BIORHYTHM_LIVE_COMMENT_POLL_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
    "BIORHYTHM_LIVE_COMMENT_POLL_INTERVAL_MS",
  );
  const energyPerComment = readPositiveInteger(
    process.env.BIORHYTHM_LIVE_COMMENT_ENERGY,
    DEFAULT_ENERGY_PER_COMMENT,
    "BIORHYTHM_LIVE_COMMENT_ENERGY",
  );
  const sync = createLiveCommentEnergySync(manager, energyPerComment);
  void sync.run();
  setInterval(() => void sync.run(), intervalMs);
  console.log(
    `[INFO][LIVE_ENERGY] Scheduling comment sync every ${intervalMs}ms (+${energyPerComment} internal energy/comment).`,
  );
}
