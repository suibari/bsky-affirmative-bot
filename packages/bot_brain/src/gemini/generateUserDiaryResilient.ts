import {
  runWithAiLadder,
  type AiLadderStep,
  type UserInfoGemini,
} from "@bsky-affirmative-bot/shared-configs";
import {
  generateUserDiary,
  type DiaryResult,
  type RecentDiaryEmoji,
} from "./generateUserDiary.js";

/**
 * 日記の再試行ラダー。段の刻み方はここ、各段のモデル/tier は shared-configs の
 * AI_FEATURES と AI_ROUTE_COMMON_DIARY_ATTEMPT_* が決める。
 */
export const DIARY_LADDER: readonly AiLadderStep[] = [
  { untilAttempt: 2, feature: "COMMON_DIARY_ATTEMPT_EARLY" },
  { untilAttempt: 4, feature: "COMMON_DIARY_ATTEMPT_MID" },
  { untilAttempt: 6, feature: "COMMON_DIARY_ATTEMPT_LATE" },
];

export const DIARY_MAX_ATTEMPTS = 6;

/**
 * 失敗後の待ち時間。Flex tier の 503 は分単位で続くので、秒オーダーで諦めない。
 * 全部使うと 30s+2m+10m+30m+60m ≒ 1時間43分。
 */
const DIARY_RETRY_DELAYS_MS = [
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
  60 * 60_000,
];

/** 開始から3時間で打ち切る。翌日の22時スケジュールと重ならない範囲に収める。 */
const DIARY_DEADLINE_MS = 3 * 60 * 60_000;

/**
 * 日記本文をモデルを上げながら再試行して生成する。
 *
 * generateUserDiary をそのまま呼ぶと、
 *   - Flex tier の 503（容量待ち）
 *   - 空レスポンス / JSON パース失敗 / 絵文字候補不足
 * のいずれでもその日の日記が丸ごと欠測する。1日1回しか機会が無いので、
 * transient は上限まで、それ以外も unknown 扱いで数回は上位モデルに賭ける。
 */
export async function generateUserDiaryResilient(
  userinfo: UserInfoGemini,
  options: {
    recentEmojis?: RecentDiaryEmoji[];
    /** ログ用の識別子。例: "[NAGI][did:plc:xxx][DIARY]" */
    label: string;
  },
): Promise<DiaryResult> {
  return runWithAiLadder({
    ladder: DIARY_LADDER,
    delaysMs: DIARY_RETRY_DELAYS_MS,
    deadlineMs: DIARY_DEADLINE_MS,
    maxAttempts: DIARY_MAX_ATTEMPTS,
    label: options.label,
    operation: "generateUserDiary",
    run: async (aiRoute) => {
      const result = await generateUserDiary(userinfo, {
        ...(options.recentEmojis ? { recentEmojis: options.recentEmojis } : {}),
        aiRoute,
      });
      if (!result || result.diary === "") {
        throw new Error("generateUserDiary returned empty");
      }
      return result;
    },
  });
}
