import rawCatalog from "./userDiaryMediaReferences.json" with { type: "json" };
import { MemoryService } from "@bsky-affirmative-bot/database";
import type {
  UserDiaryMediaKind,
  UserDiaryMediaReference,
} from "@bsky-affirmative-bot/shared-configs";
import {
  SEASONAL_WORKS_STATE_KEY,
  type SeasonalWork,
} from "./seasonalWorksState.js";

type CatalogReference = Omit<UserDiaryMediaReference, "source"> & {
  source?: never;
  era: string;
  genres: string[];
};

export const USER_DIARY_MEDIA_REFERENCE_CATALOG =
  rawCatalog as CatalogReference[];

const DAY_MS = 86_400_000;

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function diaryDayNumber(date: string): number {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid diary date: ${date}`);
  }
  return Math.floor(timestamp / DAY_MS);
}

function isMediaKind(value: unknown): value is UserDiaryMediaKind {
  return value === "anime" || value === "movie";
}

function validSeasonalReferences(value: unknown): SeasonalWork[] {
  if (!value || typeof value !== "object") return [];
  const works = (value as { works?: unknown }).works;
  if (!Array.isArray(works)) return [];
  return works.filter(
    (work): work is SeasonalWork =>
      Boolean(work) &&
      typeof work === "object" &&
      isMediaKind((work as SeasonalWork).kind) &&
      typeof (work as SeasonalWork).title === "string" &&
      Boolean((work as SeasonalWork).title.trim()) &&
      typeof (work as SeasonalWork).hookJa === "string" &&
      Boolean((work as SeasonalWork).hookJa?.trim()) &&
      typeof (work as SeasonalWork).hookEn === "string" &&
      Boolean((work as SeasonalWork).hookEn?.trim()),
  );
}

function fixedReference(did: string, dayNumber: number): UserDiaryMediaReference {
  const shiftedDay = dayNumber + (hashSeed(`${did}:schedule`) % 5);
  // 5日ごとの季節作品枠を詰めて数えるため、固定札日は一巡するまで重複しない。
  const fixedOrdinal = shiftedDay - Math.floor(shiftedDay / 5);
  const index = positiveModulo(
    fixedOrdinal + hashSeed(`${did}:catalog`),
    USER_DIARY_MEDIA_REFERENCE_CATALOG.length,
  );
  return {
    ...USER_DIARY_MEDIA_REFERENCE_CATALOG[index],
    source: "catalog",
  };
}

function seasonalReference(
  did: string,
  date: string,
  works: SeasonalWork[],
): UserDiaryMediaReference | undefined {
  const candidates = validSeasonalReferences({ works });
  if (!candidates.length) return undefined;
  const work = candidates[hashSeed(`${did}:${date}:seasonal`) % candidates.length];
  const title = work.title.trim();
  const titleEn = work.titleEn?.trim() || title;
  return {
    id: `seasonal-${hashSeed(`${work.kind}:${title}`).toString(16)}`,
    source: "seasonal",
    kind: work.kind as UserDiaryMediaKind,
    titleJa: title,
    titleEn,
    hookJa: work.hookJa!.trim(),
    hookEn: work.hookEn!.trim(),
    requiredTermsJa: [title],
    requiredTermsEn: [titleEn],
  };
}

export type SelectUserDiaryMediaReferenceOptions = {
  loadSeasonalState?: () => Promise<unknown>;
};

/**
 * 5日中4日は72件の固定札、1日は週次キャッシュの今期作を返す。
 * キャッシュ障害は日記全体を落とさず、その日の固定札へフォールバックする。
 */
export async function selectUserDiaryMediaReference(
  did: string,
  date: string,
  options: SelectUserDiaryMediaReferenceOptions = {},
): Promise<UserDiaryMediaReference> {
  const dayNumber = diaryDayNumber(date);
  const shiftedDay = dayNumber + (hashSeed(`${did}:schedule`) % 5);
  const isSeasonalDay = positiveModulo(shiftedDay, 5) === 0;
  if (!isSeasonalDay) return fixedReference(did, dayNumber);

  try {
    const state = await (options.loadSeasonalState ?? (() =>
      MemoryService.getBotState(SEASONAL_WORKS_STATE_KEY)))();
    const selected = seasonalReference(
      did,
      date,
      validSeasonalReferences(state),
    );
    if (selected) return selected;
  } catch (error) {
    console.warn("[WARN][DIARY] Failed to load seasonal media reference:", error);
  }
  return fixedReference(did, dayNumber);
}
