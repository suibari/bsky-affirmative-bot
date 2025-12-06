import { CommitCreateEvent } from "@skyware/jetstream";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { BotFeature, FeatureContext } from "./types";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { handleMode } from "./utils";
import { isReplyOrMentionToMe } from "../bsky/util";
import { NICKNAMES_BOT } from "../config";

const REGEX_FREQ = /freq(\d+)/gi;

export class FrequencyFeature implements BotFeature {
    name = "Frequency";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        const text = (record.text || "").toLowerCase();

        const isCalled = isReplyOrMentionToMe(record) || NICKNAMES_BOT.some(elem => text.includes(elem.toLowerCase()));
        if (!isCalled) return false;

        // Regex check for "freqN"
        return /freq\d+/.test(text);
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const record = event.commit.record as Record;
        const match_freq = REGEX_FREQ.exec(record.text.toLowerCase());

        // Freqが含まれなければ何もしない
        if (!match_freq) {
            return;
        }

        // エラーチェック: 0~100の整数か
        if (match_freq && (Number(match_freq[1]) < 0 || Number(match_freq[1]) > 100)) {
            return;
        }

        await handleMode(event, {
            db: context.db,
            dbColumn: "reply_freq",
            dbValue: Number(match_freq[1]),
            generateText: `了解! ${follower.displayName}さんへのリプライする頻度を${match_freq[1]}%にするね! ちなみに占いはいつでもできるよ～`,
        },
            {
                follower,
            });
    }
}
