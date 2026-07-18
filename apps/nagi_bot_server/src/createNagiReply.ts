import { generateAffirmativeWord } from "@bsky-affirmative-bot/bot-brain";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import { agent } from "./agent.js";

export async function createNagiReply(job: any) {
  const record: any = job.recordJson;
  const generated = await generateAffirmativeWord({
    follower: {
      did: job.authorDid,
      handle: job.authorDid,
      displayName: job.authorDid,
    },
    posts: [record.text ?? ""],
    langStr: "日本語",
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
      createdAt: new Date().toISOString(),
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
