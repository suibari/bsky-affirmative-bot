import {
  createPredefinedReply,
  generateAffirmativeWord,
} from "@bsky-affirmative-bot/bot-brain";
import type { UserInfoGemini } from "@bsky-affirmative-bot/shared-configs";
import { reserveNagiAiRequest } from "./nagiAiQuota.js";
import { nagiAiRouteForAttempt } from "./nagiReplyRetry.js";

type GuestLanguage = "ja" | "en";

type GuestAffirmationReplyDependencies = {
  generate?: typeof generateAffirmativeWord;
  predefined?: typeof createPredefinedReply;
  reserve?: typeof reserveNagiAiRequest;
  route?: typeof nagiAiRouteForAttempt;
  warn?: (message: string) => void;
};

const guestFollower = {
  // UserInfoGemini が要求する内部用の識別子。アカウントとして発行・保存・公開しない。
  did: "did:web:guest.invalid",
  handle: "guest.invalid",
} as UserInfoGemini["follower"];

/**
 * DIDを持たないゲストにも、まず本文に合わせた全肯定を生成する。
 * 定型文は生成不能またはサービス全体のAI上限に達した場合だけ使用する。
 */
export async function createGuestAffirmationReply(
  input: { text: string; language: GuestLanguage },
  dependencies: GuestAffirmationReplyDependencies = {},
): Promise<string> {
  const generate = dependencies.generate ?? generateAffirmativeWord;
  const predefined = dependencies.predefined ?? createPredefinedReply;
  const reserve = dependencies.reserve ?? reserveNagiAiRequest;
  const route = (dependencies.route ?? nagiAiRouteForAttempt)(1);
  const japanese = input.language === "ja";
  const languageName = japanese ? "日本語" : "English";

  try {
    const result = await generate(
      {
        follower: guestFollower,
        posts: [input.text],
        langStr: languageName,
        isSubscriber: false,
        urlContextEnabled: false,
      },
      {
        // generateAffirmativeWord が実際にAPIを呼ぶ直前に、通常のNagi返信と同じ
        // サービス全体枠を予約する。内部リトライも呼び出し回数として数える。
        beforeRequest: reserve,
        model: route.model,
        serviceTier: route.serviceTier,
      },
    );
    const reply = result.comment?.trim();
    if (!reply) throw new Error("Guest affirmation response is empty");
    return reply;
  } catch (error) {
    (dependencies.warn ?? console.warn)(
      JSON.stringify({
        level: "warn",
        event: "guest_affirmation_template_fallback",
        failure: error instanceof Error ? error.name : "unknown",
      }),
    );
    return predefined(
      {
        text: input.text,
        languageName,
        displayName: japanese ? "あなた" : "friend",
      },
      { surface: "nagi", selectorMode: "random" },
    );
  }
}
