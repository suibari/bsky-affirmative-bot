import { db, followers } from "@bsky-affirmative-bot/database";
import { inArray } from "drizzle-orm";

/**
 * 超ポジティブLvを DID ごとにまとめて引く。
 * カウンタは Bluesky 側（affirmative_bot.followers.positivity_level）と共通で、
 * ラベラーの100制限とは無関係に実値を返す。0 の DID は Map に載せない。
 */
export async function getSuperPositiveLevels(
  dids: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(dids)];
  if (!unique.length) return new Map();
  const rows = await db
    .select({ did: followers.did, level: followers.positivity_level })
    .from(followers)
    .where(inArray(followers.did, unique));
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.level) map.set(row.did, row.level);
  }
  return map;
}

/** 1 DID 分のショートカット。 */
export async function getSuperPositiveLevel(
  did: string,
): Promise<number | undefined> {
  return (await getSuperPositiveLevels([did])).get(did);
}

export type CurrentTitle = { ja: string; en: string };

/**
 * 現在の称号を DID ごとにまとめて引く。
 * Bluesky 側と共通の affirmative_bot.followers.current_title_* で、日記/占いが上書きするまで残る
 * （Bluesky のラベルは24時間で失効するが、こちらは失効しない）。
 */
export async function getCurrentTitles(
  dids: string[],
): Promise<Map<string, CurrentTitle>> {
  const unique = [...new Set(dids)];
  if (!unique.length) return new Map();
  const rows = await db
    .select({
      did: followers.did,
      ja: followers.current_title_ja,
      en: followers.current_title_en,
    })
    .from(followers)
    .where(inArray(followers.did, unique));
  const map = new Map<string, CurrentTitle>();
  for (const row of rows) {
    // 片方しか無い場合はもう片方で埋める（表示側が UI 言語で選ぶため空文字を渡さない）。
    const ja = row.ja ?? row.en;
    const en = row.en ?? row.ja;
    if (ja && en) map.set(row.did, { ja, en });
  }
  return map;
}

/** 1 DID 分のショートカット。 */
export async function getCurrentTitle(
  did: string,
): Promise<CurrentTitle | undefined> {
  return (await getCurrentTitles([did])).get(did);
}
