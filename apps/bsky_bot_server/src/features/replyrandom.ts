import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api";
import { AppBskyFeedPost } from "@atproto/api";
import { predefinedAffirmation } from "@bsky-affirmative-bot/bot-brain";
import { getLangStr, uniteDidNsidRkey } from "../bsky/util.js";
import { postContinuous } from "../bsky/postContinuous.js";
import { loadPreferredName } from "@bsky-affirmative-bot/clients";

type ProfileView = AppBskyActorDefs.ProfileView;
type Record = AppBskyFeedPost.Record;

export async function replyRandom(
  follower: ProfileView,
  event: CommitCreateEvent<"app.bsky.feed.post">,
) {
  const record = event.commit.record as Record;
  const uri = uniteDidNsidRkey(
    follower.did,
    event.commit.collection,
    event.commit.rkey,
  );
  const cid = event.commit.cid;
  const postText = record.text;
  const languageName = getLangStr(record.langs);

  if (process.env.NODE_ENV === "development") {
    console.log("[DEBUG] user>>> " + postText);
    console.log("[DEBUG] lang: " + languageName);
  }

  const preferredName = await loadPreferredName(follower.did);
  const reply = await predefinedAffirmation({
    text: postText,
    languageName,
    displayName: preferredName || follower.displayName || follower.handle,
  });
  await postContinuous(reply, { uri, cid, record });
  return null;
}
