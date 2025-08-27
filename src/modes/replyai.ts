import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyEmbedImages } from "@atproto/api";
import { getImageUrl, getLangStr, uniteDidNsidRkey } from "../bsky/util.js";
import { generateAffirmativeWord } from "../gemini/generateAffirmativeWord.js";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { replyrandom } from "../modes/replyrandom.js";
import { logger } from "../logger/index.js";
import { GeminiScore, ImageRef } from "../types.js";
import { dbLikes, dbPosts } from "../db/index.js";
import { postContinuous } from "../bsky/postContinuous.js";
import { agent } from "../bsky/agent.js";
import { getConcatAuthorFeed } from "../bsky/getConcatAuthorFeed.js";
import { embeddingTexts } from "../gemini/embeddingTexts.js";

const LATEST_POSTS_COUNT = 10; // 直近ポスト収集数

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
    // ユーザがいいねしてくれたポストを取得
    const likedPost = await dbLikes.selectDb(follower.did, "liked_post") ?? undefined;
    if (likedPost) {
      dbLikes.deleteRow(follower.did);
    }

    // ユーザの直近ポストをエンベディング解析
    const recentPosts = await getConcatAuthorFeed(follower.did, LATEST_POSTS_COUNT + 1);
    recentPosts.shift(); // 最新ポストは今回のポストのはずなので除外
    const relatedPosts = await embeddingTexts(record.text, recentPosts.map(item => (item.post.record as Record).text));

    // Gemini生成
    result = await generateAffirmativeWord({
      follower,
      langStr,
      posts: [record.text, ...relatedPosts], // 関連ポストを含める
      likedByFollower: likedPost,
      image,
    });

    // お気に入りポスト登録
    dbPosts.insertDb(follower.did);
    const prevScore = await dbPosts.selectDb(follower.did, "score") as number || 0;
    if (result.score && prevScore < result.score) {
      dbPosts.updateDb(follower.did, "post", record.text);
      dbPosts.updateDb(follower.did, "comment", result.comment);
      dbPosts.updateDb(follower.did, "score", result.score);
      dbPosts.updateDb(follower.did, "uri", uri);
    }

    // ポスト
    const text_bot = result?.comment || "";
    await postContinuous(text_bot, { uri, cid, record });

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
