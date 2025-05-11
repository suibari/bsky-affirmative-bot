import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { CommitCreateEvent } from "@skyware/jetstream";
import { handleMode, isPast } from "./index.js";
import { getLangStr } from "../bsky/util.js";
import { DJ_TRIGGER } from '../config/index.js';
import { generateRecommendedSong } from "../gemini/generateRecommendedSong.js";
import { GeminiResponseResult, UserInfoGemini } from "../types.js";
import { searchYoutubeLink } from "../youtube/index.js";

export async function handleDJ (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
  const record = event.commit.record as Record;

  return await handleMode(event, {
    triggers: DJ_TRIGGER,
    dbColumn: "last_dj_at",
    dbValue: new Date().toISOString(),
    generateText: getSongLink,
    checkConditionsAND: await isPast(event, "last_dj_at", 5), // 5mins
  },
  {
    follower,
    posts: [record.text],
    langStr: getLangStr(record.langs),
  });
}

async function getSongLink(userinfo: UserInfoGemini): Promise<GeminiResponseResult> {
  const resultGemini = await generateRecommendedSong(userinfo);
  console.log("bot>>> ", resultGemini);
  
  const resultYoutube = await searchYoutubeLink(`"${resultGemini.title}" "${resultGemini.artist}"`);
  console.log("bot>>> ", resultYoutube);

  const result = `
${resultGemini.comment}\n
title: ${resultGemini.title}\n
artist: ${resultGemini.artist}\n
\n
${resultYoutube}`;

  return result;
}
