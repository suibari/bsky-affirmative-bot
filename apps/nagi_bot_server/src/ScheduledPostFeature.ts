import type { ScheduledPostRequest, ScheduledPostResult } from "@bsky-affirmative-bot/clients";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import retry from "async-retry";
import { publishNagiPost } from "./nagiPost.js";
import { clipNagiPostText } from "./nagiPostText.js";
import { seedNagiTranslations } from "./appviewInternal.js";

export async function publishScheduledPost(request: ScheduledPostRequest): Promise<ScheduledPostResult> {
  return retry(async () => {
    const post = await publishNagiPost({
      text: request.text,
      label: "SCHEDULED_POST",
      ...(request.langs?.length ? { langs: request.langs } : {}),
      ...(request.kind === "good-night" && request.sourcePost?.network === "nagi"
        ? {
            embed: {
              $type: `${NAGI.post}#quote` as const,
              record: { uri: request.sourcePost.uri, cid: request.sourcePost.cid },
            },
          }
        : {}),
    });
    // Gemini が本文と一緒に作った対訳を翻訳キャッシュへ入れておく。これを入れないと
    // 英語圏のユーザーには機械翻訳が表示されてしまう。日本語本文と同じ規則でクリップして
    // おかないと、訳文だけ日本語に無い内容を含むことになる。
    if (request.translations?.length) {
      void seedNagiTranslations(
        post.uri,
        request.translations.map((translation) => ({
          lang: translation.lang,
          text: clipNagiPostText(translation.text, "SCHEDULED_POST"),
        })),
      );
    }
    return post;
  }, {
    retries: 2,
    onRetry: (error, attempt) => {
      console.warn(`[WARN][SCHEDULED_POST] Nagi retry ${attempt}:`, error);
    },
  });
}
