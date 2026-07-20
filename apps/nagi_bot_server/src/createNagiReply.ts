import {
  generateAffirmativeWord,
  getYokohamaWeather,
} from "@bsky-affirmative-bot/bot-brain";
import { botBiothythmManager } from "@bsky-affirmative-bot/clients";
import {
  configureBotContext,
  getBotContext,
} from "@bsky-affirmative-bot/bot-runtime";
import { NAGI, NAGI_LANGUAGES } from "@bsky-affirmative-bot/nagi-lexicon";
import { agent } from "./agent.js";
import { buildNagiReplyContext } from "./nagiReplyContext.js";
import { buildLinkAttachments } from "./nagiLinkCards.js";

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

export async function createNagiReply(job: any) {
  const record: any = job.recordJson;
  const language = replyLanguage(record.langs);
  const context = await buildNagiReplyContext(job);
  console.log("[INFO][NAGI] Gemini reply context:", context.diagnostics);
  const generated = await generateAffirmativeWord({
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

  const response = await agent.api.com.atproto.repo.putRecord({
    repo: botDid,
    collection: NAGI.post,
    rkey: sourceRkey,
    validate: false,
    record: {
      $type: NAGI.post,
      text: generated.comment,
      langs: [language.code],
      createdAt: new Date().toISOString(),
      ...(await buildLinkAttachments(generated.comment)),
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
    score: Math.max(0, Math.min(100, Math.round(generated.score))),
  };
}
