import { CommitCreateEvent } from '@skyware/jetstream';
import { PREDEFINEDMODE_TRIGGER, PREDEFINEDMODE_RELEASE_TRIGGER } from '../config/index.js';
import { handleMode } from './index.js';

const TEXT_RELEASE_U18 = "定型文モードを解除しました! これからはたまにAIを使って全肯定しますね。";
const TEXT_REGISTER_U18 = "定型文モードを設定しました! これからはAIを使わずに全肯定しますね。";

export async function handleU18Register (event: CommitCreateEvent<"app.bsky.feed.post">) {
  return await handleMode(event, {
    triggers: PREDEFINEDMODE_TRIGGER,
    dbColumn: "is_u18",
    dbValue: 1,
    generateText: TEXT_REGISTER_U18,
  });
}

export async function handleU18Release (event: CommitCreateEvent<"app.bsky.feed.post">) {
  return await handleMode(event, {
    triggers: PREDEFINEDMODE_RELEASE_TRIGGER,
    dbColumn: "is_u18",
    dbValue: 0,
    generateText: TEXT_RELEASE_U18,
  });
}
