import {
  db,
  nagiEmojiFavorites,
  nagiReadPositions,
} from "@bsky-affirmative-bot/database";
import {
  EMOJI_FAVORITES_LIMIT,
  READ_POSITION_SECTIONS,
  type EmojiFavorite,
  type PreferencesView,
  type PutPreferencesInput,
  type ReadPosition,
  type ReadPositionSection,
} from "@bsky-affirmative-bot/nagi-lexicon";
import { eq, sql } from "drizzle-orm";
import { ApiError } from "../middleware/errors.js";

const MAX_URI_LENGTH = 2048;
const MAX_UNICODE_EMOJI_LENGTH = 64;

const isSection = (value: unknown): value is ReadPositionSection =>
  READ_POSITION_SECTIONS.includes(value as ReadPositionSection);

const invalid = (field: string): never => {
  throw new ApiError(400, "invalid_request", `Invalid ${field}`);
};

/** 入力は他人が書いた JSON として扱う。publish した lexicon は AppView を検証してくれない。 */
function parseReadPositions(input: unknown): ReadPosition[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > READ_POSITION_SECTIONS.length)
    invalid("readPositions");
  const seen = new Set<string>();
  return (input as unknown[]).map((raw) => {
    const item = (raw ?? {}) as Partial<ReadPosition>;
    if (!isSection(item.section)) invalid("readPositions.section");
    const section = item.section as ReadPositionSection;
    // 同じセクションを2つ送られると単調マージの勝敗が入力順に依存してしまう。
    if (seen.has(section)) invalid("readPositions.section (duplicate)");
    seen.add(section);
    if (
      typeof item.uri !== "string" ||
      !item.uri ||
      item.uri.length > MAX_URI_LENGTH
    )
      invalid("readPositions.uri");
    if (
      typeof item.indexedAt !== "string" ||
      Number.isNaN(Date.parse(item.indexedAt))
    )
      invalid("readPositions.indexedAt");
    return {
      section,
      indexedAt: item.indexedAt as string,
      uri: item.uri as string,
    };
  });
}

/**
 * お気に入りはクライアントの localStorage と同じ形をそのまま預かる。中身は表示用の
 * スナップショットで、権威は custom なら uri（クライアントが getEmoji で再解決する）。
 * ここでは「他人のデータで DB を膨らませない」ための最低限の形だけ確認する。
 */
function parseEmojiFavorites(input: unknown): EmojiFavorite[] {
  if (!Array.isArray(input) || input.length > EMOJI_FAVORITES_LIMIT)
    invalid("emojiFavorites");
  return (input as unknown[]).map((raw) => {
    const item = (raw ?? {}) as { kind?: unknown; emoji?: unknown };
    if (item.kind === "unicode") {
      if (
        typeof item.emoji !== "string" ||
        !item.emoji ||
        item.emoji.length > MAX_UNICODE_EMOJI_LENGTH
      )
        invalid("emojiFavorites");
      return { kind: "unicode" as const, emoji: item.emoji as string };
    }
    if (item.kind !== "custom" || !item.emoji || typeof item.emoji !== "object")
      invalid("emojiFavorites");
    const emoji = item.emoji as Record<string, unknown>;
    for (const key of ["uri", "cid", "did", "name", "url", "mediaType"]) {
      const value = emoji[key];
      if (typeof value !== "string" || !value) invalid("emojiFavorites");
    }
    if ((emoji.uri as string).length > MAX_URI_LENGTH) invalid("emojiFavorites");
    return { kind: "custom" as const, emoji } as EmojiFavorite;
  });
}

function parseFavoritesUpdatedAt(input: unknown): Date {
  if (typeof input !== "string" || Number.isNaN(Date.parse(input)))
    throw new ApiError(
      400,
      "invalid_request",
      "emojiFavoritesUpdatedAt is required with emojiFavorites",
    );
  return new Date(input);
}

async function selectPreferences(did: string): Promise<PreferencesView> {
  const [positions, favorites] = await Promise.all([
    db
      .select({
        section: nagiReadPositions.section,
        indexedAt: nagiReadPositions.indexedAt,
        uri: nagiReadPositions.uri,
      })
      .from(nagiReadPositions)
      .where(eq(nagiReadPositions.did, did)),
    db
      .select({
        choices: nagiEmojiFavorites.choices,
        updatedAt: nagiEmojiFavorites.updatedAt,
      })
      .from(nagiEmojiFavorites)
      .where(eq(nagiEmojiFavorites.did, did))
      .limit(1),
  ]);
  const favoritesRow = favorites[0];
  return {
    readPositions: positions
      .filter((row) => isSection(row.section))
      .map((row) => ({
        section: row.section as ReadPositionSection,
        indexedAt: row.indexedAt.toISOString(),
        uri: row.uri,
      })),
    emojiFavorites: Array.isArray(favoritesRow?.choices)
      ? (favoritesRow.choices as EmojiFavorite[])
      : [],
    // 未同期（行が無い）なら省略する。クライアントはこれを「初回同期」の合図に使う。
    ...(favoritesRow
      ? { emojiFavoritesUpdatedAt: favoritesRow.updatedAt.toISOString() }
      : {}),
  };
}

/** 本人の同期設定を返す唯一の読み出し口。呼び出し側は必ず requiredServiceAuth を使うこと。 */
export function getPreferences(did: string): Promise<PreferencesView> {
  return selectPreferences(did);
}

export async function putPreferences(
  did: string,
  input: PutPreferencesInput,
): Promise<PreferencesView> {
  const readPositions = parseReadPositions(input.readPositions);
  const hasFavorites = input.emojiFavorites !== undefined;
  const emojiFavorites = hasFavorites
    ? parseEmojiFavorites(input.emojiFavorites)
    : [];
  const favoritesUpdatedAt = hasFavorites
    ? parseFavoritesUpdatedAt(input.emojiFavoritesUpdatedAt)
    : undefined;

  if (readPositions.length) {
    await db
      .insert(nagiReadPositions)
      .values(
        readPositions.map((position) => ({
          did,
          section: position.section,
          indexedAt: new Date(position.indexedAt),
          uri: position.uri,
        })),
      )
      // 既読は前にしか進まない。復帰の遅れた端末が古い位置を送っても巻き戻らないよう、
      // クライアントの isNewerPosition と同じ (indexedAt, uri) 辞書順で勝った方だけ残す。
      // ON CONFLICT の WHERE では対象行を非修飾のテーブル名で参照する。
      .onConflictDoUpdate({
        target: [nagiReadPositions.did, nagiReadPositions.section],
        set: {
          indexedAt: sql`excluded.indexed_at`,
          uri: sql`excluded.uri`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`(excluded.indexed_at, excluded.uri) > (read_positions.indexed_at, read_positions.uri)`,
      });
  }

  if (favoritesUpdatedAt) {
    // 順序のある1本の配列なので部分マージに意味がない。updated_at による後勝ち。
    // 初回の突き合わせ（サーバとローカルの和集合）はクライアント側で作って送ってくる。
    await db
      .insert(nagiEmojiFavorites)
      .values({ did, choices: emojiFavorites, updatedAt: favoritesUpdatedAt })
      .onConflictDoUpdate({
        target: nagiEmojiFavorites.did,
        set: {
          choices: sql`excluded.choices`,
          updatedAt: sql`excluded.updated_at`,
        },
        setWhere: sql`excluded.updated_at > emoji_favorites.updated_at`,
      });
  }

  // 送った値ではなくマージ後の確定値を返す。負けた端末はこれで自分側を直せる。
  return selectPreferences(did);
}
