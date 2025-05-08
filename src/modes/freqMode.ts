import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { CommitCreateEvent } from "@skyware/jetstream";
import { handleMode } from "./handleMode.js";

const REGEX_FREQ = /freq(\d+)/gi;

export async function handleFreq (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
  const record = event.commit.record as Record;
  const match_freq = REGEX_FREQ.exec(record.text.toLowerCase());

  // Freqが含まれなければ何もしない
  if (!match_freq) {
    return false;
  }

  // エラーチェック: 0~100の整数か
  if (match_freq && (Number(match_freq[1]) < 0 || Number(match_freq[1]) > 100)) {
    return false;
  }

  return await handleMode(event, {
    triggers: ["freq"],
    dbColumn: "reply_freq",
    dbValue: Number(match_freq[1]),
    generateText: `了解! ${follower.displayName}さんへのリプライする頻度を${match_freq[1]}%にするね! ちなみに占いはいつでもできるよ～`,
  },
  {
    follower,
  });
}
