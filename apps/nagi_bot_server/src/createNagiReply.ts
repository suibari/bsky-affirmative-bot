import {
  conversation,
  generateAffirmativeWord,
  getYokohamaWeather,
  predefinedAffirmation,
} from "@bsky-affirmative-bot/bot-brain";
import {
  botBiothythmManager,
  MemoryService,
} from "@bsky-affirmative-bot/clients";
import {
  configureBotContext,
  getBotContext,
} from "@bsky-affirmative-bot/bot-runtime";
import { NAGI, NAGI_LANGUAGES } from "@bsky-affirmative-bot/nagi-lexicon";
import {
  buildNagiConversationHistory,
  type ConversationTurn,
} from "./nagiConversationHistory.js";
import { isReplyToBot } from "./NagiReplyFeature.js";
import {
  buildNagiReplyContext,
  loadNagiReplyAuthor,
} from "./nagiReplyContext.js";
import { publishNagiPost } from "./nagiPost.js";
import type { NagiReplyMode } from "./nagiAiQuota.js";
import type { NagiAiRoute } from "./nagiReplyRetry.js";
import {
  MODEL_GEMINI,
  MODEL_GEMINI_HIGH,
} from "@bsky-affirmative-bot/shared-configs";

configureBotContext({
  getWeather: getYokohamaWeather,
  getStatus: () => botBiothythmManager.getContext(),
});

function replyLanguage(langs: unknown) {
  const value = Array.isArray(langs) ? String(langs[0] ?? "") : "";
  const code = value.split("-")[0]?.toLowerCase();
  return (
    NAGI_LANGUAGES.find((language) => language.code === code) ?? {
      code: "en",
      name: "English",
    }
  );
}

/**
 * 会話モード。Bluesky の ConversationFeature と同じく conv_history を記憶として
 * 引き回し、生成後に更新する。スコアは付けない（肯定ポストとして扱わない）。
 */
async function generateConversationReply(
  job: any,
  context: Awaited<ReturnType<typeof buildNagiReplyContext>>,
  langStr: string,
  beforeRequest?: () => Promise<void>,
) {
  const did = job.authorDid;
  const userText = context.posts[0] ?? "";
  const history = await buildNagiConversationHistory(job);

  const result = await conversation(
    {
      follower: context.follower,
      posts: [userText],
      image: context.image,
      embed: context.embed,
      history,
      isSubscriber: true,
      urlContextEnabled: context.urlContextEnabled,
      botContext: await getBotContext(),
      langStr,
    } as any,
    { beforeRequest },
  );
  const comment = result.text_bot ?? "";
  const newHistory: ConversationTurn[] = result.new_history ?? [];
  if (!comment) throw new Error("Response text is empty");

  // 最後の user ターンをプロンプト全文から純粋な入力テキストのみに置換する。
  for (let i = newHistory.length - 1; i >= 0; i--) {
    if (newHistory[i].role !== "user") continue;
    newHistory[i] = { role: "user", parts: [{ text: userText }] };
    break;
  }

  // 会話記録に inlineData（画像）が含まれると巨大すぎるので削除しておく。
  for (const content of newHistory) {
    if (!content.parts) continue;
    content.parts = content.parts.filter(
      (part: any) => !("inlineData" in part),
    );
  }

  // Nagi 限定ユーザには followers 行が無いことがある。ensureFollower は
  // 新規行で follow 統計を加算してしまうため、素の upsert を使う。
  await MemoryService.upsertFollowerInteraction(did);
  await MemoryService.updateFollower(did, "conv_history", newHistory);
  await MemoryService.updateFollower(did, "last_conv_at", new Date());
  await MemoryService.logUsage("conversation", did);
  console.log(`[INFO][NAGI][${did}] send conversation-result`);

  return { comment, score: undefined };
}

export async function createNagiReply(
  job: any,
  options: {
    mode: NagiReplyMode;
    beforeGeminiRequest?: () => Promise<void>;
    aiRoute?: NagiAiRoute;
  },
) {
  const record: any = job.recordJson;
  const language = replyLanguage(record.langs);
  const conversationMode = isReplyToBot(record, process.env.NAGI_BOT_DID!);
  let generated: { comment: string; score?: number };

  if (options.mode === "template") {
    const author = await loadNagiReplyAuthor(job.authorDid);
    generated = {
      comment: await predefinedAffirmation({
        text: typeof record.text === "string" ? record.text : "",
        languageName: language.name,
        displayName: author.view.displayName,
      }),
    };
  } else {
    const context = await buildNagiReplyContext(job);
    const aiRoute = options.aiRoute ?? "lite-flex";
    console.log("[INFO][NAGI] Gemini reply context:", {
      ...context.diagnostics,
      mode: conversationMode ? "conversation" : "affirmative",
    });
    generated = conversationMode
      ? await generateConversationReply(
          job,
          context,
          language.name,
          options.beforeGeminiRequest,
        )
      : await generateAffirmativeWord(
          {
            follower: context.follower,
            posts: context.posts,
            image: context.image,
            embed: context.embed,
            likedByFollower: context.likedByFollower,
            followersFriend: context.followersFriend,
            isSubscriber: context.isSubscriber,
            urlContextEnabled: context.urlContextEnabled,
            botContext: await getBotContext(),
            langStr: language.name,
          } as any,
          {
            beforeRequest: options.beforeGeminiRequest,
            model:
              aiRoute === "flash-standard" ? MODEL_GEMINI_HIGH : MODEL_GEMINI,
            serviceTier: aiRoute === "lite-flex" ? "flex" : "standard",
          },
        );
  }

  const sourceRkey = job.sourceUri.split("/").at(-1)!;
  const root = record.reply?.root ?? {
    uri: job.sourceUri,
    cid: job.sourceCid,
  };

  const response = await publishNagiPost({
    text: generated.comment,
    label: "NAGI_REPLY",
    rkey: sourceRkey,
    langs: [language.code],
    // 元投稿がチャンネル所属なら返信も同じ channel を継承し、CH TL に並ぶ（Misskey 同様）。
    // こっそりはスレッドルートだけが所有し、AppView が返信にも有効範囲を適用する。
    // 返信へ複製すると、返信単位で公開範囲を持てるように見えてしまうため保存しない。
    ...(record.channel ? { channel: record.channel } : {}),
    reply: {
      root,
      parent: {
        uri: job.sourceUri,
        cid: job.sourceCid,
      },
    },
  });

  return {
    uri: response.uri,
    // 会話ターンはスコアを持たない = 肯定ポストとして扱わない。
    score:
      generated.score === undefined
        ? undefined
        : Math.max(0, Math.min(100, Math.round(generated.score))),
  };
}
