import { MemoryService } from '@bsky-affirmative-bot/database';
import { BADGE_DEF, MAX_LEVEL } from '@bsky-affirmative-bot/shared-configs';
import { botLabelerManager } from './LabelerService.js';

// nagi_bot_server は shared-configs に直接依存していないため、ここから再エクスポートする。
export { SUPER_POSITIVE_SCORE_THRESHOLD } from '@bsky-affirmative-bot/shared-configs';

/**
 * 超ポジティブLvを1つ加算する。Bluesky（replyai）とNagi（NagiReplyWorker）の共通処理。
 *
 * 内部値 followers.positivity_level は上限なしで伸びる（Nagiは実値を表示する）。
 * Blueskyのラベルは MAX_LEVEL にクリップして登録するため、既にクリップ後の値に達している
 * ユーザーではラベラーへのリクエストを一切行わない。
 *
 * @returns level: 加算後の内部レベル / reachedMax: 今回ちょうど MAX_LEVEL に到達したか
 */
export async function awardSuperPositiveLevel(
  did: string
): Promise<{ level: number; reachedMax: boolean }> {
  await MemoryService.ensureFollower(did);

  const followerData = await MemoryService.getFollower(did);
  const currentLevel: number = followerData?.positivity_level || 0;
  const nextLevel = currentLevel + 1;

  const currentLabelLevel = Math.min(currentLevel, MAX_LEVEL);
  const nextLabelLevel = Math.min(nextLevel, MAX_LEVEL);

  console.log(`[INFO][BADGE][POSITIVITY] ${did}: level ${currentLevel} -> ${nextLevel}`);

  // ラベル側に変化がある場合のみラベラーを叩く（MAX到達後はラベルが固定されるためスキップ）。
  if (nextLabelLevel !== currentLabelLevel) {
    const isNewMax = nextLabelLevel === MAX_LEVEL;
    const levelLabel = isNewMax ? 'Lv. MAX' : `Lv.${nextLabelLevel}`;
    // ラベル定義は identifier 単位でグローバルなため、description に渡すレベルもクリップ後の値を使う。
    const nextDef = BADGE_DEF.superPositiveLv(nextLabelLevel, levelLabel);

    try {
      // 定義が無い状態で付与するとクライアント側でバッジ名/説明が解決できないため、先に upsert する。
      await botLabelerManager.upsertLabelDefinition(nextDef.id, nextDef.locales);
      await botLabelerManager.applyLabel(did, nextDef.id, false);

      if (currentLabelLevel > 0) {
        const prevBadgeId = BADGE_DEF.superPositiveLv(currentLabelLevel, '').id;
        await botLabelerManager.applyLabel(did, prevBadgeId, true).catch((err: any) => {
          console.error(
            `[WARN][BADGE][POSITIVITY] Failed to negate previous badge ${prevBadgeId} for ${did}:`,
            err.message
          );
        });
      }
      console.log(`[INFO][BADGE][POSITIVITY] Successfully applied badge ${nextDef.id} to ${did}`);
    } catch (err: any) {
      // ラベラーが落ちていてもNagi側の表示は進めたいので、DB更新は続行する。
      console.error(
        `[ERROR][BADGE][POSITIVITY] Failed to apply label for ${did}:`,
        err.message
      );
    }
  }

  await MemoryService.updateFollower(did, 'positivity_level', nextLevel);

  return { level: nextLevel, reachedMax: nextLevel === MAX_LEVEL };
}
