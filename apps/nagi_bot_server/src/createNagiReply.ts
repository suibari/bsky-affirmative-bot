import {
  conversation,
  generateAffirmativeWord,
  getYokohamaWeather,
} from "@bsky-affirmative-bot/bot-brain";
import { botBiothythmManager, MemoryService } from "@bsky-affirmative-bot/clients";
import {
  configureBotContext,
  getBotContext,
} from "@bsky-affirmative-bot/bot-runtime";
import { NAGI, NAGI_LANGUAGES } from "@bsky-affirmative-bot/nagi-lexicon";
import retry from "async-retry";
import { agent } from "./agent.js";
import {
  buildNagiConversationHistory,
  type ConversationTurn,
} from "./nagiConversationHistory.js";
import { isReplyToBot } from "./NagiReplyFeature.js";
import { buildNagiReplyContext } from "./nagiReplyContext.js";
import { buildLinkAttachments } from "./nagiLinkCards.js";
import { clipNagiPostText } from "./nagiPostText.js";

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
) {
  const did = job.authorDid;
  const userText = context.posts[0] ?? "";
  const history = await buildNagiConversationHistory(job);

  let comment = "";
  let newHistory: ConversationTurn[] = [];

  await retry(
    async () => {
      const result = await conversation({
        follower: context.follower,
        posts: [userText],
        image: context.image,
        embed: context.embed,
        history,
        isSubscriber: true,
        urlContextEnabled: context.urlContextEnabled,
        botContext: await getBotContext(),
        langStr,
      } as any);

      comment = result.text_bot ?? "";
      newHistory = result.new_history ?? [];

      if (!comment) throw new Error("Response text is empty, retrying.");
    },
    {
      retries: 2,
      onRetry: (error: any, attempt) => {
        console.warn(`[WARN][NAGI][${did}] Conversation retry ${attempt}: ${error.message}`);
      },
    },
  );

  // 最後の user ターンをプロンプト全文から純粋な入力テキストのみに置換する。
  for (let i = newHistory.length - 1; i >= 0; i--) {
    if (newHistory[i].role !== "user") continue;
    newHistory[i] = { role: "user", parts: [{ text: userText }] };
    break;
  }

  // 会話記録に inlineData（画像）が含まれると巨大すぎるので削除しておく。
  for (const content of newHistory) {
    if (!content.parts) continue;
    content.parts = content.parts.filter((part: any) => !("inlineData" in part));
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

export async function createNagiReply(job: any) {
  const record: any = job.recordJson;
  const language = replyLanguage(record.langs);
  const context = await buildNagiReplyContext(job);
  const conversationMode = isReplyToBot(record, process.env.NAGI_BOT_DID!);
  console.log("[INFO][NAGI] Gemini reply context:", {
    ...context.diagnostics,
    mode: conversationMode ? "conversation" : "affirmative",
  });
  const generated = conversationMode
    ? await generateConversationReply(job, context, language.name)
    : await generateAffirmativeWord({
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
      } as any);

  const botDid = process.env.NAGI_BOT_DID!;
  const sourceRkey = job.sourceUri.split("/").at(-1)!;
  const root = record.reply?.root ?? {
    uri: job.sourceUri,
    cid: job.sourceCid,
  };

  // facet のバイト位置がズレないよう、切り詰めた後の本文からリンクを検出する。
  const text = clipNagiPostText(generated.comment, "NAGI_REPLY");

  const response = await agent.api.com.atproto.repo.putRecord({
    repo: botDid,
    collection: NAGI.post,
    rkey: sourceRkey,
    validate: false,
    record: {
      $type: NAGI.post,
      text,
      langs: [language.code],
      createdAt: new Date().toISOString(),
      ...(await buildLinkAttachments(text)),
      // 元投稿がチャンネル所属なら返信も同じ channel を継承し、CH TL に並ぶ（Misskey 同様）。
      // 元が「グローバルに出さない」（kossori、または旧データの channelOnly）ならこの返信も
      // kossori にしてグローバル露出を揃える。
      ...(record.channel ? { channel: record.channel } : {}),
      ...(record.channel && (record.kossori || record.channelOnly) ? { kossori: true } : {}),
      reply: {
        root,
        parent: {
          uri: job.sourceUri,
          cid: job.sourceCid,
        },
      },
    },
  } as any);

  return {
    uri: response.data.uri,
    // 会話ターンはスコアを持たない = 肯定ポストとして扱わない。
    score:
      generated.score === undefined
        ? undefined
        : Math.max(0, Math.min(100, Math.round(generated.score))),
  };
}
