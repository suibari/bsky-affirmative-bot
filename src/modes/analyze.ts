import { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post';
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { agent } from '../bsky/agent.js';
import { getLangStr } from "../bsky/util.js";
import { ANALYZE_TRIGGER } from "../config/index.js";
import { handleMode, isPast } from "./index.js";
import { GeminiResponseResult, UserInfoGemini } from '../types.js';
import { generateAnalyzeResult } from '../gemini/generateAnalyzeResult.js';
import { textToImageBufferWithBackground } from '../util/canvas.js';

export async function handleAnalyaze (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
  const record = event.commit.record as Record;

  return await handleMode(event, {
    triggers: ANALYZE_TRIGGER,
    dbColumn: "last_analyze_at",
    dbValue: new Date().toISOString(),
    generateText: getBlobWithAnalyze,
    checkConditionsAND: await isPast(event, "last_analyze_at", 6 * 24), // 6days
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
