import { db, nagiBotReplyJobs } from "@bsky-affirmative-bot/database";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";

export async function onNagiPost(evt: any) {
  if (process.env.NAGI_BOT_ENABLED === "false" || !evt.commit?.record) {
    return;
  }

  const did = evt.did;
  const record = evt.commit.record;
  const botDid = process.env.NAGI_BOT_DID;

  if (!botDid || did === botDid || record.$type !== NAGI.post) {
    return;
  }

  const topLevel = !record.reply;
  const directlyToBot = record.reply?.parent?.uri?.startsWith(`at://${botDid}/${NAGI.post}/`);

  if (!topLevel && !directlyToBot) {
    return;
  }

  const uri = `at://${did}/${NAGI.post}/${evt.commit.rkey}`;

  await db
    .insert(nagiBotReplyJobs)
    .values({
      sourceUri: uri,
      sourceCid: evt.commit.cid,
      authorDid: did,
      recordJson: record,
    })
    .onConflictDoNothing();
}
