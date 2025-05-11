import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { CommitCreateEvent } from "@skyware/jetstream";
import { handleMode, isPast } from "./index.js";
import { getLangStr, uniteDidNsidRkey } from "../bsky/util.js";
import { CHEER_TRIGGER } from '../config/index.js';
import { db } from "../db/index.js";
import { generateCheerResult } from "../gemini/generateCheerResult.js";
import { UserInfoGemini, GeminiResponseResult } from "../types.js";
import { repost } from "../bsky/repost.js";

export async function handleCheer (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
  const record = event.commit.record as Record;

  return await handleMode(event, {
    triggers: CHEER_TRIGGER,
    dbColumn: "last_cheer_at",
    dbValue: new Date().toISOString(),
    generateText: repostAndGenerate,
    checkConditionsAND: await isPast(event, "last_cheer_at", 8) && await isPastFollowed(event, 31), // 8hours since prev, 31days since follow
    disableDefaultCondition: true,
    disableReply: true,
  },
  {
    follower,
    posts: [record.text],
    langStr: getLangStr(record.langs),
  });
}

async function repostAndGenerate(userinfo: UserInfoGemini, event: CommitCreateEvent<"app.bsky.feed.post">): Promise<GeminiResponseResult> {
  const uri = uniteDidNsidRkey(event.did, event.commit.collection, event.commit.rkey);
  const cid = String(event.commit.cid);
  
  await repost(uri, cid);

  const text = await generateCheerResult(userinfo);

  return text;
}

const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)

export async function isPastFollowed(event: CommitCreateEvent<"app.bsky.feed.post">, days_thrd: number) {
  const did = String(event.did);
  const msec_thrd = days_thrd * 24 * 60 * 60 * 1000;
  const now = new Date().getTime();
  const followedAt = new Date(await db.selectDb(did, "created_at"));
  const followedAtJst = new Date(followedAt.getTime() + OFFSET_UTC_TO_JST).getTime();

  return (now - followedAtJst > msec_thrd);
}
