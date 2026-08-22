import { asc, eq, isNull } from "drizzle-orm";
import {
  bot_memory_impressions,
  bot_memory_pronunciations,
  bot_memory_pronunciation_scans,
  db,
} from "./db.js";

export type BotMemoryPronunciationKind = "work" | "proper_noun";
export type BotMemoryPronunciationStatus = "active" | "ignored" | "disabled";
export type BotMemoryPronunciationOrigin = "auto" | "manual";

export interface PendingBotMemoryPronunciation {
  impressionId: number;
  surface: string;
  impressionKind: "work" | "word";
}

export interface BotMemoryPronunciationInference {
  surface: string;
  spokenForm: string | null;
  kind: BotMemoryPronunciationKind;
  eligible: boolean;
}

export interface BotMemoryPronunciationState {
  surface: string;
  spokenForm: string | null;
  kind: BotMemoryPronunciationKind;
  status: BotMemoryPronunciationStatus;
  origin: BotMemoryPronunciationOrigin;
  evidenceCount: number;
  conflictCount: number;
}

const UNSAFE_SURFACE = /(?:https?:\/\/|www\.|[@#]|[\r\n]|命令|指示|プロンプト|system|ignore)/iu;
const SPOKEN_FORM = /^[\p{Script=Katakana}ー・、\s]+$/u;

export function normalizePronunciationSurface(value: string): string {
  return value.normalize("NFKC").trim().replace(/^[「『\"']+|[」』\"']+$/g, "");
}

export function isEligiblePronunciationSurface(value: string): boolean {
  const surface = normalizePronunciationSurface(value);
  return Array.from(surface).length >= 3 && Array.from(surface).length <= 40 &&
    !UNSAFE_SURFACE.test(surface);
}

export function normalizeSpokenForm(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function isValidSpokenForm(value: string): boolean {
  const spoken = normalizeSpokenForm(value);
  return Array.from(spoken).length >= 2 && Array.from(spoken).length <= 80 &&
    SPOKEN_FORM.test(spoken);
}

/** 自動学習はmanual/disabledを変えず、競合する読みも採用しない。 */
export function mergeAutomaticPronunciation(
  current: BotMemoryPronunciationState | null,
  inference: BotMemoryPronunciationInference,
): BotMemoryPronunciationState {
  const surface = normalizePronunciationSurface(inference.surface);
  const spokenForm = inference.eligible && inference.spokenForm
    ? normalizeSpokenForm(inference.spokenForm)
    : null;
  if (!current) {
    return {
      surface,
      spokenForm,
      kind: inference.kind,
      status: spokenForm ? "active" : "ignored",
      origin: "auto",
      evidenceCount: 1,
      conflictCount: 0,
    };
  }
  const next = { ...current, evidenceCount: current.evidenceCount + 1 };
  if (current.origin === "manual" || current.status === "disabled") return next;
  if (!spokenForm) return next;
  if (current.status === "ignored") {
    return { ...next, spokenForm, kind: inference.kind, status: "active" };
  }
  if (current.spokenForm !== spokenForm) {
    return { ...next, conflictCount: current.conflictCount + 1 };
  }
  return next;
}

export async function getPendingBotMemoryPronunciations(
  limit = 16,
): Promise<PendingBotMemoryPronunciation[]> {
  const rows = await db
    .select({
      impressionId: bot_memory_impressions.id,
      surface: bot_memory_impressions.label,
      impressionKind: bot_memory_impressions.kind,
    })
    .from(bot_memory_impressions)
    .leftJoin(
      bot_memory_pronunciation_scans,
      eq(bot_memory_pronunciation_scans.impression_id, bot_memory_impressions.id),
    )
    .where(isNull(bot_memory_pronunciation_scans.impression_id))
    .orderBy(asc(bot_memory_impressions.id))
    .limit(Math.max(1, Math.min(50, limit)));
  return rows.map((row) => ({
    impressionId: row.impressionId,
    surface: row.surface,
    impressionKind: row.impressionKind as "work" | "word",
  }));
}

/** drizzle-kit pushはDDLだけなので、既知の回帰修正は起動時にも冪等に保証する。 */
export async function ensureDefaultBotMemoryPronunciations() {
  await db.insert(bot_memory_pronunciations).values({
    surface: "攻殻機動隊",
    spoken_form: "コウカク、キドウタイ",
    kind: "work",
    status: "active",
    origin: "manual",
  }).onConflictDoNothing();
}

function stateFromRow(row: typeof bot_memory_pronunciations.$inferSelect): BotMemoryPronunciationState {
  return {
    surface: row.surface,
    spokenForm: row.spoken_form,
    kind: row.kind as BotMemoryPronunciationKind,
    status: row.status as BotMemoryPronunciationStatus,
    origin: row.origin as BotMemoryPronunciationOrigin,
    evidenceCount: row.evidence_count,
    conflictCount: row.conflict_count,
  };
}

export async function saveBotMemoryPronunciationInference(
  impressionId: number,
  inference: BotMemoryPronunciationInference,
): Promise<BotMemoryPronunciationState | null> {
  return db.transaction(async (tx) => {
    const [impression] = await tx
      .select({ label: bot_memory_impressions.label })
      .from(bot_memory_impressions)
      .where(eq(bot_memory_impressions.id, impressionId))
      .limit(1);
    const surface = normalizePronunciationSurface(inference.surface);
    if (!impression || normalizePronunciationSurface(impression.label) !== surface) return null;

    const [row] = await tx
      .select()
      .from(bot_memory_pronunciations)
      .where(eq(bot_memory_pronunciations.surface, surface))
      .limit(1);
    const next = mergeAutomaticPronunciation(row ? stateFromRow(row) : null, {
      ...inference,
      surface,
    });
    const now = new Date();
    await tx
      .insert(bot_memory_pronunciations)
      .values({
        surface: next.surface,
        spoken_form: next.spokenForm,
        kind: next.kind,
        status: next.status,
        origin: next.origin,
        evidence_count: next.evidenceCount,
        conflict_count: next.conflictCount,
        last_seen_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: bot_memory_pronunciations.surface,
        set: {
          spoken_form: next.spokenForm,
          kind: next.kind,
          status: next.status,
          origin: next.origin,
          evidence_count: next.evidenceCount,
          conflict_count: next.conflictCount,
          last_seen_at: now,
          updated_at: now,
        },
      });
    await tx.insert(bot_memory_pronunciation_scans)
      .values({ impression_id: impressionId })
      .onConflictDoNothing();
    return next;
  });
}

export async function setManualBotMemoryPronunciation(
  surfaceInput: string,
  spokenFormInput: string,
  kind: BotMemoryPronunciationKind = "proper_noun",
) {
  const surface = normalizePronunciationSurface(surfaceInput);
  const spokenForm = normalizeSpokenForm(spokenFormInput);
  if (!surface || !isValidSpokenForm(spokenForm)) {
    throw new Error("surface または spoken form が不正です");
  }
  const now = new Date();
  const [row] = await db.insert(bot_memory_pronunciations).values({
    surface,
    spoken_form: spokenForm,
    kind,
    status: "active",
    origin: "manual",
    updated_at: now,
    last_seen_at: now,
  }).onConflictDoUpdate({
    target: bot_memory_pronunciations.surface,
    set: {
      spoken_form: spokenForm,
      kind,
      status: "active",
      origin: "manual",
      updated_at: now,
      last_seen_at: now,
    },
  }).returning();
  return row;
}

export async function disableBotMemoryPronunciation(surfaceInput: string) {
  const surface = normalizePronunciationSurface(surfaceInput);
  const [row] = await db.update(bot_memory_pronunciations).set({
    status: "disabled",
    origin: "manual",
    updated_at: new Date(),
  }).where(eq(bot_memory_pronunciations.surface, surface)).returning();
  return row ?? null;
}

export async function listBotMemoryPronunciations() {
  return db.select().from(bot_memory_pronunciations)
    .orderBy(asc(bot_memory_pronunciations.surface));
}
