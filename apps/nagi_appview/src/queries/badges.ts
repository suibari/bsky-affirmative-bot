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
