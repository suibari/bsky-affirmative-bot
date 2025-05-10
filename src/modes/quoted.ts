import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { CommitCreateEvent } from "@skyware/jetstream";
import { handleMode, isPast } from "./index.js";
import { generateFortuneResult } from "../gemini/generateFortuneResult.js";
import { getLangStr } from "../bsky/util.js";
import { FORTUNE_TRIGGER } from '../config/index.js';
import { db } from "../db/index.js";

export async function handleFortune (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
  const record = event.commit.record as Record;

  return await handleMode(event, {
    triggers: FORTUNE_TRIGGER,
    dbColumn: "last__at",
    dbValue: new Date().toISOString(),
    generateText: generateFortuneResult,
    checkConditionsAND: await isPast(event, 8) && await isPastFollowed(event, 31), // 8hours since prev, 31days since follow
  },
  {
    follower,
    langStr: getLangStr(record.langs),
  });
}

const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)

export async function isPastFollowed(event: CommitCreateEvent<"app.bsky.feed.post">, days_thrd: number) {
  const did = String(event.did);
  const msec_thrd = days_thrd * 24 * 60 * 60 * 1000;
  const now = new Date().getTime();
  const followedAt = new Date(String(await db.selectDb(did, "created_at")));
  const followedAtJst = new Date(followedAt.getTime() + OFFSET_UTC_TO_JST).getTime();

  return (now - followedAtJst > msec_thrd);
}
