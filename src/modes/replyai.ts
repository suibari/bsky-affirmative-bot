import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { getImageUrl, getLangStr, splitUri, uniteDidNsidRkey } from "../bsky/util.js";
import { generateAffirmativeWord } from "../gemini/generateAffirmativeWord.js";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { replyrandom } from "../modes/replyrandom.js";
import { Embed, GeminiScore, ImageRef } from "../types.js";
import { dbLikes, dbPosts } from "../db/index.js";
import { postContinuous } from "../bsky/postContinuous.js";
import { agent } from "../bsky/agent.js";
import { fetchSentiment } from "../util/negaposi.js";
import retry from 'async-retry';
import { getConcatAuthorFeed } from "../bsky/getConcatAuthorFeed.js";
import { embeddingTexts } from "../gemini/embeddingTexts.js";
import { getConcatProfiles } from "../bsky/getConcatProfiles.js";
import { AtpAgent } from "@atproto/api";
import { getPds } from "../bsky/getPds.js";
import { parseEmbedPost } from "../bsky/parseEmbedPost.js";
import { followers } from "../index.js";

const NOUN_MATCH_NUM = 4; // フォロワーの友人を探す際の名詞一致数の閾値

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
  const image = getImageUrl(follower.did, record.embed);

  // 引用ポスト解析
  let embed: Embed | undefined = undefined;
  const embed_tmp = await parseEmbedPost(record);
  if (embed_tmp && embed_tmp.profile_embed &&
    (
      followers.find(follower => follower.did === embed_tmp.profile_embed?.did) ||
      process.env.BSKY_DID === embed_tmp.profile_embed?.did // botの投稿を引用でも反応する
    )
  ){
    // フォロワーに引用先が含まれるならセット
    embed = embed_tmp;
    if (embed.image_embed) {
      image.push(...embed.image_embed);
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[DEBUG] user>>> " + text_user);
    console.log("[DEBUG] image: " + image?.map(img => img.image_url).join(", "));
    console.log("[DEBUG] lang: " + langStr);
    console.log(`[DEBUG] embed: ${embed?.text_embed}`)
  }

  try {
    // ユーザがいいねしてくれたポストを取得
    const likedPost = await dbLikes.selectDb(follower.did, "liked_post") ?? undefined;
    if (likedPost) {
      dbLikes.deleteRow(follower.did);
    }

    // 共通の趣味を持つフォロワーのポストを取得
    let followersFriend: { profile: ProfileView; post: string; uri: string } | undefined = undefined;
    followersFriend = await getFollowersFriend(text_user, follower.did, NOUN_MATCH_NUM);

    // Gemini生成
    result = await retry(async () => {
      return await generateAffirmativeWord({
        follower,
        langStr,
        posts: [text_user, ...relatedPosts],
        likedByFollower: likedPost,
        image,
        followersFriend,
        embed,
      });
    }, {
      retries: 3,
      onRetry: (error: Error, attempt: number) => {
        console.warn(`[WARN][${follower.did}] Attempt ${attempt} to generateAffirmativeWord failed. Retrying... Error: ${error.message}`);
      }
    });

    // お気に入りポスト登録
    dbPosts.insertDb(follower.did);
    const prevScore = await dbPosts.selectDb(follower.did, "score") as number || 0;
    if (result.score && prevScore < result.score && text_user.length > 0) { // 空ポスト除外
      dbPosts.updateDb(follower.did, "post", record.text);
      dbPosts.updateDb(follower.did, "comment", result.comment);
      dbPosts.updateDb(follower.did, "score", result.score);
      dbPosts.updateDb(follower.did, "uri", uri);
    }

    // ポスト
    const text_bot = result?.comment || "";
    await postContinuous(text_bot, { uri, cid, record }, undefined);

    return result;
  } catch (e: any) {
    // Gemini生成が3回失敗した場合、ランダムワード返信する
    console.warn(`[WARN][${follower.did}] Gemini fetch failed after multiple retries: `, e);

    await replyrandom(follower, event);
    
    return null
  }
}

async function getFollowersFriend(
  text_user: string,
  userDid: string,
  NOUN_MATCH_NUM: number = 1
) {
  const retryOptions = {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    onRetry: (error: Error, attempt: number) => {
      console.warn(`Attempt ${attempt} failed. Retrying... Error: ${error.message}`);
    }
  };

  // 1. 入力テキストから名詞を抽出
  const userPostNouns = (await retry(() => fetchSentiment([text_user]), retryOptions)).nouns[0];

  // 2. DBから全ポスト取得 & 名詞抽出
  const allPosts = (await dbPosts.selectRows(['did', 'post', 'uri'])) ?? [];
  const validPosts = allPosts.filter(p => p.post && p.post.trim() !== '');
  if (validPosts.length === 0) {
    return undefined;
  }
  const allNouns = (await retry(() => fetchSentiment(validPosts.map(p => p.post)), retryOptions)).nouns;

  // 3. ポストごとに {did, uri, post, nouns} をまとめる
  const allPostNouns = validPosts.map((p, i) => ({
    did: p.did,
    uri: p.uri,
    post: p.post,
    nouns: allNouns[i],
  }));

  // 4. フォロワーのポストと名詞一致するものを抽出
  const matchingPosts = allPostNouns.filter(postData => {
    const commonNouns = postData.nouns.filter(noun => userPostNouns.includes(noun));
    if (commonNouns.length >= NOUN_MATCH_NUM && postData.did !== userDid && !!postData.uri) {
      // デバッグ出力
      console.log("[DEBUG] ==== Noun Mathing Candidates ====");
      console.log("[DEBUG] user post:", text_user);
      console.log("[DEBUG] candidate post:", postData.post);
      console.log("[DEBUG] matched nouns:", commonNouns);
      console.log("[DEBUG] match num", commonNouns.length);
      return true;
    }
    return false;
  });

  if (matchingPosts.length === 0) return undefined;

  // 5. 一致したdidのプロフィールを取得
  const friendsProfiles = await getConcatProfiles({
    actors: matchingPosts.map(mp => mp.did),
  });
  if (!friendsProfiles || friendsProfiles.length === 0) return undefined;

  // 6. 最初の一致したプロフィール＋ポストを返す
  const firstProfile = friendsProfiles[0] as ProfileView;
  const firstPost = matchingPosts.find(mp => mp.did === firstProfile.did);

  return firstProfile && firstPost
    ? {
        profile: firstProfile,
        post: firstPost.post,
        uri: firstPost.uri,
      }
    : undefined;
}
