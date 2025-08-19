import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyEmbedImages } from "@atproto/api";
import { getImageUrl, getLangStr, uniteDidNsidRkey } from "../bsky/util.js";
import { generateAffirmativeWord } from "../gemini/generateAffirmativeWord.js";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { replyrandom } from "../modes/replyrandom.js";
import { RPD } from "../gemini/index.js";
import { GeminiScore, ImageRef } from "../types.js";
import { dbLikes } from "../db/index.js";
import { postContinuous } from "../bsky/postContinuous.js";

export async function replyai(
  follower: ProfileView,
  event: CommitCreateEvent<"app.bsky.feed.post">,
) {
  const record = event.commit.record as Record;
  const uri = uniteDidNsidRkey(follower.did, event.commit.collection, event.commit.rkey);
  const cid = event.commit.cid;
  const langStr = getLangStr(record.langs);

  let result: GeminiScore | undefined;
  const text_user = record.text;

  let image: ImageRef[] | undefined = undefined;
  let mimeType: string | undefined = undefined;
  if (record.embed) {
    (image = getImageUrl(follower.did, record.embed as AppBskyEmbedImages.Main));
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[DEBUG] user>>> " + text_user);
    console.log("[DEBUG] image: " + image?.map(img => img.image_url).join(", "));
    console.log("[DEBUG] lang: " + langStr);
  }

  try {
    const likedPost = await dbLikes.selectDb(follower.did, "liked_post");
    if (likedPost) {
      dbLikes.deleteRow(follower.did);
    }

    result = await generateAffirmativeWord({
      follower,
      langStr,
      posts: [record.text],
      likedByFollower: likedPost,
      image,
    });

    const text_bot = result?.comment || "";
    await postContinuous(text_bot, { uri, cid, record });

    RPD.add();

    return result;
  } catch (e: any) {
    // Geminiエラー時、ランダムワード返信する
    if (e.message?.includes("429")) {
      console.warn("[WARN] Gemini fetch failed due to billing error, falling back to random word.");
    } else {
      console.error("[ERROR] Gemini fetch failed: ", e);
    }

    await replyrandom(follower, event);
    
    return null
  }
}