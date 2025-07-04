import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyEmbedImages } from "@atproto/api";
import { getImageUrl, getLangStr, uniteDidNsidRkey } from "./util.js";
import { generateAffirmativeWord } from "../gemini/generateAffirmativeWord.js";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { getRandomWordByNegaposi } from "../modes/randomword.js";
import { postContinuous } from "./postContinuous.js";
import { RPD } from "../gemini/index.js";
import { GeminiScore } from "../types.js";
import { dbLikes } from "../db/index.js";
import { getSubscribersFromSheet } from "../gsheet/index.js";

export async function replyAffermativeWord(
  follower: ProfileView,
  event: CommitCreateEvent<"app.bsky.feed.post">,
  isU18mode = false
) {
  const record = event.commit.record as Record;
  const langStr = getLangStr(record.langs);
  const cid = event.commit.cid;
  const uri = uniteDidNsidRkey(follower.did, event.commit.collection, event.commit.rkey);

  let result: GeminiScore | undefined;
  let text_bot: string;
  const text_user = record.text;

  let image_url: string | undefined = undefined;
  let mimeType: string | undefined = undefined;
  if (record.embed) {
    ({ image_url, mimeType } = getImageUrl(follower.did, record.embed as AppBskyEmbedImages.Main));
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[DEBUG] user>>> " + text_user);
    console.log("[DEBUG] image: " + image_url);
    console.log("[DEBUG] lang: " + langStr);
  }

  // AIを使うか判定
  // NOTE: 上位callbackPostでsubsucriber判定しているのでこの関数は廃止し、そっちに統合するのがベター
  const subscribers = await  getSubscribersFromSheet();
  if (subscribers.includes(follower.did)) {
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
        image_url,
        image_mimeType: mimeType,
      });

      text_bot = result?.comment || "";
      RPD.add();
    } catch (e: any) {
      if (e.message?.includes("429")) {
        console.warn("[WARN] Gemini fetch failed due to billing error, falling back to random word.");
      } else {
        console.error("[ERROR] Gemini fetch failed: ", e);
      }

      text_bot = await getRandomWordByNegaposi(text_user, langStr);
      text_bot = text_bot.replace("${name}", follower.displayName ?? "");
    }
  } else {
    text_bot = await getRandomWordByNegaposi(text_user, langStr);
    text_bot = text_bot.replace("${name}", follower.displayName ?? "");
  }

  // ポスト
  await postContinuous(text_bot, { uri, cid, record });

  return { text: text_bot, score: result?.score };
}
