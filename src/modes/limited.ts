import { CommitCreateEvent } from '@skyware/jetstream';
import { PREDEFINEDMODE_TRIGGER, PREDEFINEDMODE_RELEASE_TRIGGER, AIONLYMODE_RELEASE_TRIGGER, AIONLYMODE_TRIGGER } from '../config/index.js';
import { handleMode } from './index.js';
import { SQLite3 } from '../db/index.js';
import { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { getLangStr } from '../bsky/util.js';

export async function handleU18Register (event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
  const record = event.commit.record as Record;
  const langStr = getLangStr(record.langs);

  const TEXT_REGISTER_U18 = (langStr === "日本語") ? 
    "定型文モードを設定しました! これからはAIを使わずに全肯定しますね。":
    "Predefined reply mode enabled! I will give affirmative replies without using AI from now on.";

  return await handleMode(event, {
    triggers: PREDEFINEDMODE_TRIGGER,
    db,
    dbColumn: "is_u18",
    dbValue: 1,
    generateText: TEXT_REGISTER_U18,
  });
}

export async function handleU18Release (event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
  const record = event.commit.record as Record;
  const langStr = getLangStr(record.langs);

  const TEXT_RELEASE_U18 = (langStr === "日本語") ?
    "定型文モードを解除しました! これからはたまにAIを使って全肯定しますね。":
    "Predefined reply mode disabled! I will sometimes use AI to give affirmative replies from now on.";

  return await handleMode(event, {
    triggers: PREDEFINEDMODE_RELEASE_TRIGGER,
    db,
    dbColumn: "is_u18",
    dbValue: 0,
    generateText: TEXT_RELEASE_U18,
  });
}

export async function handleAIonlyRegister (event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
  const record = event.commit.record as Record;
  const langStr = getLangStr(record.langs);

  const TEXT_REGISTER_AIONLY = (langStr === "日本語") ?
    "AI限定モードを設定しました! これからは定型文を使わずに全肯定しますね。":
    "AI only mode enabled! I will give affirmative replies using only AI from now on.";

  return await handleMode(event, {
    triggers: AIONLYMODE_TRIGGER,
    db,
    dbColumn: "is_ai_only",
    dbValue: 1,
    generateText: TEXT_REGISTER_AIONLY,
  });
}

export async function handleAIonlyRelease (event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
  const record = event.commit.record as Record;
  const langStr = getLangStr(record.langs);

  const TEXT_RELEASE_AIONLY = (langStr === "日本語") ? 
    "AI限定モードを設定しました! これからはたまに定型文を使って全肯定しますね。":
    "AI only mode disabled! I will sometimes use predefined replies to give affirmative replies from now on.";

  return await handleMode(event, {
    triggers: AIONLYMODE_RELEASE_TRIGGER,
    db,
    dbColumn: "is_ai_only",
    dbValue: 0,
    generateText: TEXT_RELEASE_AIONLY,
  });
}
