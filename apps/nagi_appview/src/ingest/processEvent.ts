import { db, nagiIngestState } from "@bsky-affirmative-bot/database";
import { sql } from "drizzle-orm";
import { applyMutation } from "./applyMutation.js";

/** Jetstream イベントだけが重複排除ログと再開カーソルを更新する。 */
export async function processEvent(evt: any): Promise<void> {
  const result = await applyMutation(evt, {
    trackJetstream: true,
    emitPush: true,
  });
  if (result.cursorAdvanced || !Number.isFinite(Number(evt?.time_us))) return;

  // 対象外・検証不成立は AppView の状態を変えないため、評価済み位置だけを進める。
  await db
    .insert(nagiIngestState)
    .values({ key: "jetstream", cursor: Number(evt.time_us) })
    .onConflictDoUpdate({
      target: nagiIngestState.key,
      set: {
        cursor: sql`greatest(${nagiIngestState.cursor}, excluded.cursor)`,
        updatedAt: new Date(),
      },
    });
}
