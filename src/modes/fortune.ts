import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { CommitCreateEvent } from "@skyware/jetstream";
import { handleMode, isPast } from "./index.js";
import { generateFortuneResult } from "../gemini/generateFortuneResult.js";
import { getLangStr } from "../bsky/util.js";
import { FORTUNE_TRIGGER } from '../config/index.js';

export async function handleFortune (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
  const record = event.commit.record as Record;

  return await handleMode(event, {
    triggers: FORTUNE_TRIGGER,
    dbColumn: "last_uranai_at",
    dbValue: new Date().toISOString(),
    generateText: generateFortuneResult,
    checkConditionsAND: await isPast(event, "last_uranai_at", 8 * 60), // 8hours
  },
  {
    follower,
    langStr: getLangStr(record.langs),
  });
}
