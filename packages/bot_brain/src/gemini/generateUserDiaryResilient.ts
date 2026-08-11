import {
  runWithAiLadder,
  type AiLadderStep,
  type UserInfoGemini,
} from "@bsky-affirmative-bot/shared-configs";
import {
  generateDiaryEmojis,
  generateUserDiaryDraft,
  selectDiaryEmojis,
  type DiaryDraft,
  type GenerateUserDiaryOptions,
  type DiaryResult,
  type RecentDiaryEmoji,
  type UserDiaryDayContext,
} from "./generateUserDiary.js";
import type { UserDiaryMediaReference } from "@bsky-affirmative-bot/shared-configs";
import type { GeminiUsage } from "./util.js";

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
export const DIARY_EMOJI_MAX_ATTEMPTS = 3;

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
    dayContext?: UserDiaryDayContext;
    mediaReference?: UserDiaryMediaReference;
    /** ログ用の識別子。例: "[NAGI][did:plc:xxx][DIARY]" */
    label: string;
    /** テスト注入用。 */
    generateDraft?: (
      userinfo: UserInfoGemini,
      options: GenerateUserDiaryOptions,
    ) => Promise<DiaryDraft>;
    /** テスト注入用。 */
    generateEmoji?: typeof generateDiaryEmojis;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<DiaryResult> {
  const generateDraft = options.generateDraft ?? generateUserDiaryDraft;
  const generateEmoji = options.generateEmoji ?? generateDiaryEmojis;
  const logUsage = (
    operation: "body" | "emoji",
    attempt: number,
    usage: GeminiUsage,
    valid: boolean,
  ) => {
    console.info(
      `${options.label} diary_ai operation=${operation} attempt=${attempt} model=${usage.model} tier=${usage.serviceTier ?? "auto"} latency_ms=${usage.latencyMs} input_tokens=${usage.promptTokens} output_tokens=${usage.outputTokens} thinking_tokens=${usage.thinkingTokens} total_tokens=${usage.totalTokens} valid=${valid}`,
    );
  };
  const draft = await runWithAiLadder({
    ladder: DIARY_LADDER,
    delaysMs: DIARY_RETRY_DELAYS_MS,
    deadlineMs: DIARY_DEADLINE_MS,
    maxAttempts: DIARY_MAX_ATTEMPTS,
    label: options.label,
    operation: "generateUserDiary",
    run: async (aiRoute, attempt) => {
      let usage: GeminiUsage | undefined;
      try {
        const result = await generateDraft(userinfo, {
          ...(options.recentEmojis ? { recentEmojis: options.recentEmojis } : {}),
          ...(options.dayContext ? { dayContext: options.dayContext } : {}),
          ...(options.mediaReference ? { mediaReference: options.mediaReference } : {}),
          aiRoute,
          onUsage: (value) => {
            usage = value;
          },
        });
        if (!result || result.diary === "") {
          throw new Error("generateUserDiary returned empty");
        }
        if (usage) logUsage("body", attempt, usage, true);
        return result;
      } catch (error) {
        if (usage) logUsage("body", attempt, usage, false);
        throw error;
      }
    },
    ...(options.sleep ? { sleep: options.sleep } : {}),
  });

  try {
    const emoji = selectDiaryEmojis(draft.emojiCandidates, options.recentEmojis);
    console.info(`${options.label} diary_ai operation=emoji_initial valid=true`);
    return {
      diary: draft.diary,
      title_ja: draft.title_ja,
      title_en: draft.title_en,
      emoji,
    };
  } catch (error) {
    console.warn(
      `${options.label} diary_ai operation=emoji_initial valid=false error=${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const emoji = await runWithAiLadder({
    ladder: [
      { untilAttempt: 2, feature: "COMMON_USER_DIARY_EMOJI" },
      { untilAttempt: 3, feature: "COMMON_DIARY_ATTEMPT_LATE" },
    ],
    delaysMs: [5_000, 30_000],
    deadlineMs: 10 * 60_000,
    maxAttempts: DIARY_EMOJI_MAX_ATTEMPTS,
    label: options.label,
    operation: "generateDiaryEmojis",
    run: async (aiRoute, attempt) => {
      let usage: GeminiUsage | undefined;
      try {
        const value = await generateEmoji(
          {
            date: options.dayContext?.date ?? "unknown",
            text: draft.diary,
            titleJa: draft.title_ja,
            titleEn: draft.title_en,
            recentEmojis: options.recentEmojis,
          },
          {
            aiRoute,
            onUsage: (next) => {
              usage = next;
            },
          },
        );
        if (usage) logUsage("emoji", attempt, usage, true);
        return value;
      } catch (error) {
        if (usage) logUsage("emoji", attempt, usage, false);
        throw error;
      }
    },
    ...(options.sleep ? { sleep: options.sleep } : {}),
  });
  return {
    diary: draft.diary,
    title_ja: draft.title_ja,
    title_en: draft.title_en,
    emoji,
  };
}
