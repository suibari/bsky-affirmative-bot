import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { CommitCreateEvent } from "@skyware/jetstream";
import { handleMode, isPast } from "./index.js";
import { getLangStr } from "../bsky/util.js";
import { DJ_TRIGGER } from '../config/index.js';
import { generateRecommendedSong } from "../gemini/generateRecommendedSong.js";
import { GeminiResponseResult, UserInfoGemini } from "../types.js";
import { agent } from "../bsky/agent.js";
import { SQLite3 } from "../db/index.js";
import { searchSpotifyTrack, searchSpotifyUrlAndAddPlaylist } from "../spotify/index.js";

export async function handleDJ (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
  const record = event.commit.record as Record;

  // ポスト収集
  const response = await agent.getAuthorFeed({ 
    actor: follower.did,
    limit: 100,
    filter: "posts_with_replies",
  });
  const posts = response.data.feed
    .filter(post  => !post.reason) // リポスト除外
    .map(post => (post.post.record as Record).text);

  // 0要素目にDJリクエストポスト、1要素目以降に過去ポストをセット
  posts.unshift(record.text);

  return await handleMode(event, {
    triggers: DJ_TRIGGER,
    db,
    dbColumn: "last_dj_at",
    dbValue: new Date().toISOString(),
    generateText: getSongLink,
    checkConditionsAND: await isPast(event, db, "last_dj_at", 5), // 5mins
  },
  {
    follower,
    posts,
    langStr: getLangStr(record.langs),
  });
}

async function getSongLink(userinfo: UserInfoGemini): Promise<GeminiResponseResult> {
  const resultGemini = await generateRecommendedSong(userinfo);
  const resultSpotify = await searchSpotifyTrack(resultGemini.artist, resultGemini.title);

  const result = 
`${resultGemini.comment}
title: ${resultGemini.title}
artist: ${resultGemini.artist}

${resultSpotify?.url ?? "[Sorry, I couldn't find the song on Spotify...]"}`;

  return result;
}
