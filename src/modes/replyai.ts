import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyEmbedImages } from "@atproto/api";
import { getImageUrl, getLangStr, uniteDidNsidRkey } from "../bsky/util.js";
import { generateAffirmativeWord } from "../gemini/generateAffirmativeWord.js";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { replyrandom } from "../modes/replyrandom.js";
import { GeminiScore, ImageRef } from "../types.js";
import { dbLikes, dbPosts } from "../db/index.js";
import { postContinuous } from "../bsky/postContinuous.js";
import { agent } from "../bsky/agent.js";
import { fetchSentiment } from "../util/negaposi.js";
import { getConcatAuthorFeed } from "../bsky/getConcatAuthorFeed.js";
import { embeddingTexts } from "../gemini/embeddingTexts.js";
import { getConcatProfiles } from "../bsky/getConcatProfiles.js";

export async function replyai(
  follower: ProfileView,
  event: CommitCreateEvent<"app.bsky.feed.post">,
  relatedPosts: string[],
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

    // 名詞の一覧を取得
    const userPostNouns = (await fetchSentiment([text_user])).nouns[0];

    // dbPostsから全ポストを取得し、名詞の一覧を取得
    const allPosts = await dbPosts.selectRows(['did', 'post']) ?? [];
    const allNouns = (await fetchSentiment(allPosts.map(p => p.post))).nouns;
    const allPostNouns = allPosts.map((p, index) => ({
      did: p.did,
      nouns: allNouns[index],
    }));

    // 名詞が一致したらdbPostsの対応するdidとpostを取得
    const matchingPosts = allPostNouns
      .filter(postData => postData.nouns.some(noun => userPostNouns.includes(noun)))
      .map(postData => {
        const matchingPost = allPosts.find(p => p.did === postData.did);
        // 自分の投稿は除外する
        if (postData.did === follower.did) {
          return null; // 除外する
        }
        return { did: postData.did, post: matchingPost ? matchingPost.post : "" };
      })
      .filter(Boolean) as { did: string; post: string }[]; // nullを除外して型を保証
    
    // 一致したdidのプロフィールを取得
    const matchingPostDids = matchingPosts.map(mp => mp.did);
    const friendsProfiles = await getConcatProfiles({actors: matchingPostDids});

    // followersFriend作成
    const followersFriend = friendsProfiles && friendsProfiles.length > 0 ? {
      profile: friendsProfiles[0] as ProfileView,
      post: matchingPosts.find(mp => mp.did === friendsProfiles[0].did)?.post || ""
    } : undefined;

    // Gemini生成
    result = await generateAffirmativeWord({
      follower,
      langStr,
      posts: [record.text, ...relatedPosts, ...matchingPosts.map(mp => mp.post)], // 関連ポストと一致したpostを含める
      likedByFollower: likedPost,
      image,
      followersFriend,
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
