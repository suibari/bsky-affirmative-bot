import { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post';
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { agent, checkWithRefreshSession } from '../bsky/agent.js';
import { getLangStr } from "../bsky/util.js";
import { ANALYZE_TRIGGER } from "../config/index.js";
import { handleMode } from "./handleMode.js";
import { GeminiResponseResult, UserInfoGemini } from '../types.js';
import { generateAnalyzeResult } from '../gemini/generateAnalyzeResult.js';
import { textToImageBufferWithBackground } from '../util/canvas.js';
import { db } from '../db/index.js';

const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)
const MINUTES_THRD_RESPONSE = 7 * 24 * 60 * 60 * 1000; // 7day

export async function handleFortune (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
  const record = event.commit.record as Record;

  return await handleMode(event, {
    triggers: ANALYZE_TRIGGER,
    dbColumn: "last_analyze_at",
    dbValue: "CURRENT_TIMESTAMP",
    generateText: getBlobWithAnalyze,
    checkConditions: await isPast(event),
  },
  {
    follower,
    langStr: getLangStr(record.langs),
  });
}

async function isPast(event: CommitCreateEvent<"app.bsky.feed.post">) {
  const postedAt = new Date((event.commit.record as Record).createdAt);
  const lastUranaiAt = new Date(String(await db.selectDb(event.did, "last_uranai_at")) || 0);
  const lastUranaiAtJst = new Date(lastUranaiAt.getTime() + OFFSET_UTC_TO_JST);

  return (postedAt.getTime() - lastUranaiAtJst.getTime() > MINUTES_THRD_RESPONSE);
}

async function getBlobWithAnalyze(userinfo: UserInfoGemini): Promise<GeminiResponseResult> {
  const TEXT_INTRO_ANALYZE = (userinfo.langStr === "日本語") ?
  `${userinfo.follower.displayName}さんのポストから、あなたの性格を分析したよ！ 画像を貼るので見てみてね。性格分析は1週間に1回までしかできないので、時間がたったらまたやってみてね！` :
  `${userinfo.follower.displayName}, I analyzed your personality from your posts! Check the image. You can only do personality analysis once a week, so try again after some time!`;

  await checkWithRefreshSession();

  // ポスト収集
  const response = await agent.getAuthorFeed({ 
    actor: userinfo.follower.did,
    limit: 100,
    filter: "posts_with_replies",
  });
  const posts = response.data.feed
    .filter(post  => !post.reason) // リポスト除外
    .map(post => (post.post.record as Record).text);
  userinfo.posts = posts;

  // 占い
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
