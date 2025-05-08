import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { CommitCreateEvent } from "@skyware/jetstream";
import { handleMode } from "./handleMode.js";
import { generateFortuneResult } from "../gemini/generateFortuneResult.js";
import { getLangStr } from "../bsky/util.js";
import { FORTUNE_TRIGGER } from '../config/index.js';
import { db } from "../db/index.js";

const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)
const MINUTES_THRD_RESPONSE = 8 * 60 * 60 * 1000; // 8hour

export async function handleFortune (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
  const record = event.commit.record as Record;

  return await handleMode(event, {
    triggers: FORTUNE_TRIGGER,
    dbColumn: "last_uranai_at",
    dbValue: "CURRENT_TIMESTAMP",
    generateText: generateFortuneResult,
    checkConditions: await isPast(event),
  },
  {
    follower,
    langStr: getLangStr(record.langs),
  });
}

async function isPast(event: CommitCreateEvent<"app.bsky.feed.post">) {
  const postedAt = new Date((event.commit.record as Record).createdAt);
  const lastAt = new Date(String(await db.selectDb(event.did, "last_uranai_at")) || 0);
  const lastAtJst = new Date(lastAt.getTime() + OFFSET_UTC_TO_JST);

  return (postedAt.getTime() - lastAtJst.getTime() > MINUTES_THRD_RESPONSE);
}
