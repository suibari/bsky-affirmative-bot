import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { CommitCreateEvent } from "@skyware/jetstream";
import { handleMode, isPast } from "./index.js";
import { generateFortuneResult } from "../gemini/generateFortuneResult.js";
import { getLangStr } from "../bsky/util.js";
import { FORTUNE_TRIGGER } from '../config/index.js';
import { SQLite3 } from "../db/index.js";
import { UserInfoGemini, GeminiResponseResult } from "../types.js";
import { textToImageBufferWithBackground } from "../util/canvas.js";
import { agent } from "../bsky/agent.js";

export async function handleFortune (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
  const record = event.commit.record as Record;

  return await handleMode(event, {
    triggers: FORTUNE_TRIGGER,
    db,
    dbColumn: "last_uranai_at",
    dbValue: new Date().toISOString(),
    generateText: getBlobWithAnalyze,
    checkConditionsAND: await isPast(event, db, "last_uranai_at", 8 * 60), // 8hours
  },
  {
    follower,
    langStr: getLangStr(record.langs),
  });
}

async function getBlobWithAnalyze(userinfo: UserInfoGemini): Promise<GeminiResponseResult> {
  const TEXT_INTRO_ANALYZE = (userinfo.langStr === "日本語") ?
  `${userinfo.follower.displayName}さんを占ったよ！ 画像を貼るので見てみてね。占いは1日に1回までしかできないので、明日またやってみてね！` :
  `${userinfo.follower.displayName}, I did a fortune reading for you! Check the image. You can only do fortune reading once a day, so try again tommorow!`;

  const result = await generateFortuneResult(userinfo);

  if (process.env.NODE_ENV === "development") {
    console.log("[DEBUG] bot>>> " + result);
  }

  // 画像生成
  const buffer =  await textToImageBufferWithBackground(result, "./img/bot-tan-fortune.png");

  // uploadBlod
  const {blob} = (await agent.uploadBlob(buffer, {encoding: "image/png"})).data;

  return {
    text: TEXT_INTRO_ANALYZE,
    imageBlob: blob,
  };
}
