import { Record as RecordPost } from '@atproto/api/dist/client/types/app/bsky/feed/post';
import { Record as RecordList } from '@atproto/api/dist/client/types/com/atproto/repo/listRecords';
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { agent } from '../bsky/agent.js';
import { getLangStr } from "../bsky/util.js";
import { ANALYZE_TRIGGER } from "../config/index.js";
import { handleMode, isPast } from "./index.js";
import { GeminiResponseResult, UserInfoGemini } from '../types.js';
import { generateAnalyzeResult } from '../gemini/generateAnalyzeResult.js';
import { textToImageBufferWithBackground } from '../util/canvas.js';
import { getConcatPosts } from '../bsky/getConcatPosts.js';
import { AtpAgent } from "@atproto/api";
import { getPds } from '../bsky/getPds.js';
import { SQLite3 } from '../db/index.js';
import { getConcatAuthorFeed } from '../bsky/getConcatAuthorFeed.js';

export async function handleAnalyze (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
  const record = event.commit.record as RecordPost;

  return await handleMode(event, {
    triggers: ANALYZE_TRIGGER,
    db,
    dbColumn: "last_analyze_at",
    dbValue: new Date().toISOString(),
    generateText: getBlobWithAnalyze,
    checkConditionsAND: await isPast(event, db, "last_analyze_at", 6 * 24 * 60), // 6days
  },
  {
    follower,
    langStr: getLangStr(record.langs),
  });
}

async function getBlobWithAnalyze(userinfo: UserInfoGemini): Promise<GeminiResponseResult> {
  const TEXT_INTRO_ANALYZE = (userinfo.langStr === "日本語") ?
  `${userinfo.follower.displayName}さんのポストから、あなたの性格を分析したよ！ 画像を貼るので見てみてね。性格分析は1週間に1回までしかできないので、時間がたったらまたやってみてね！` :
  `${userinfo.follower.displayName}, I analyzed your personality from your posts! Check the image. You can only do personality analysis once a week, so try again after some time!`;

  // ポスト収集
  const feeds = await getConcatAuthorFeed(userinfo.follower.did, 100);
  userinfo.posts = feeds.map(feed => (feed.post.record as RecordPost).text);

  // いいね収集
  const agentPDS = new AtpAgent({service: await getPds(userinfo.follower.did)});
  const responseLike = await agentPDS.com.atproto.repo.listRecords({
    repo: userinfo.follower.did,
    collection: "app.bsky.feed.like",
    limit: 100,
  });
  const uris = (responseLike.data.records as RecordList[])
    .map(record => (record.value as any).subject.uri);
  const likes = (await getConcatPosts(uris))
    .map(like => (like.record as RecordPost).text);
  userinfo.likedByFollower = likes;

  const result = await generateAnalyzeResult(userinfo);

  if (process.env.NODE_ENV === "development") {
    console.log("[DEBUG] bot>>> " + result);
  }

  // 画像生成
  const buffer =  await textToImageBufferWithBackground(result);

  // uploadBlod
  const {blob} = (await agent.uploadBlob(buffer, {encoding: "image/png"})).data;

  return {
    text: TEXT_INTRO_ANALYZE,
    imageBlob: blob,
  };
}
