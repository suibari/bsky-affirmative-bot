import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyEmbedImages } from "@atproto/api";
import { getImageUrl, getLangStr } from "./util.js";
import { generateAffirmativeWord } from "../gemini/generateAffirmativeWord.js";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { getRandomWordByNegaposi } from "../modes/randomword.js";
import { postContinuous } from "./postContinuous.js";
import { RPD } from "../gemini/index.js";

export async function replyAffermativeWord(follower: ProfileView, event: CommitCreateEvent<"app.bsky.feed.post">, isU18mode = false) {
  const record = event.commit.record as Record;
  const langStr = getLangStr(record.langs);
  let text_bot;

  const text_user = record.text;

  let image_url: string | undefined = undefined;
  let mimeType: string | undefined = undefined;
  if (record.embed && record.embed.$type === "app.bsky.embed.images") {
    ({image_url, mimeType} = getImageUrl(follower.did, record.embed as AppBskyEmbedImages.Main));
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[DEBUG] user>>> " + text_user);
    console.log("[DEBUG] image: " + image_url);
    console.log("[DEBUG] lang: " + langStr);
  }

  // AIを使うか判定
  if (RPD.checkMod() && !isU18mode) {
    text_bot = await generateAffirmativeWord({
      follower,
      langStr,
      posts: [record.text],
      image_url,
      image_mimeType: mimeType,
    });
    RPD.add();
  } else {
    text_bot = await getRandomWordByNegaposi(text_user, langStr);
    text_bot = text_bot.replace("${name}", follower.displayName ?? "");
  }

  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  text_bot = text_bot.split("-----")[0];

  // ポスト
  await postContinuous(text_bot, record);

  return;
}
