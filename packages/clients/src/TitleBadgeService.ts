import { BADGE_DEF } from '@bsky-affirmative-bot/shared-configs';
import { MemoryService } from '@bsky-affirmative-bot/database';
import { botLabelerManager } from './LabelerService.js';

const LABEL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 日記でもらった称号を反映する。
 *
 * - Bluesky: ラベラーに定義を upsert し、24時間の期限付きラベルを貼る
 * - 共通: followers.current_title_* を更新する。Nagi のバッジ表示はこの列を見るので、
 *   ラベルと違って次の日記/占いが上書きするまで維持される
 *
 * Nagi の日記は Bluesky の日記を代替するため、Nagi 側からもこれを呼ぶ。
 * そうしないと Nagi を使った日だけ Bluesky のバッジが消えてしまう。
 */
export async function applyDiaryTitle(
  did: string,
  title: { title_ja: string; title_en: string },
): Promise<void> {
  await MemoryService.ensureFollower(did);
  const def = BADGE_DEF.title(did, title.title_ja, title.title_en);
  console.log(
    `[INFO][BADGE][DIARY] Upserting title badge definition for ${did}: ${title.title_ja} / ${title.title_en}`,
  );

  await botLabelerManager.upsertLabelDefinition(def.id, def.locales);

  const expDate = new Date(Date.now() + LABEL_TTL_MS).toISOString();
  await botLabelerManager.applyLabel(did, def.id, false, expDate);

  await MemoryService.updateFollower(did, 'current_title_ja', title.title_ja);
  await MemoryService.updateFollower(did, 'current_title_en', title.title_en);
  console.log(
    `[INFO][BADGE][DIARY] Successfully applied title badge ${def.id} to ${did} with exp=${expDate}`,
  );
}
