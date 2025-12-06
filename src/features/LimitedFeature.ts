import { CommitCreateEvent } from "@skyware/jetstream";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { BotFeature, FeatureContext } from "./types";
import { PREDEFINEDMODE_TRIGGER, PREDEFINEDMODE_RELEASE_TRIGGER, AIONLYMODE_TRIGGER, AIONLYMODE_RELEASE_TRIGGER, NICKNAMES_BOT } from "../config";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { handleMode } from "./utils";
import { getLangStr, isReplyOrMentionToMe } from "../bsky/util";
import { SQLite3 } from "../db";

export class LimitedFeature implements BotFeature {
    name = "Limited";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        const text = (record.text || "").toLowerCase();

        const isCalled = isReplyOrMentionToMe(record) || NICKNAMES_BOT.some(elem => text.includes(elem.toLowerCase()));
        if (!isCalled) return false;

        return (
            PREDEFINEDMODE_TRIGGER.some((trigger: string) => text.includes(trigger.toLowerCase())) ||
            PREDEFINEDMODE_RELEASE_TRIGGER.some((trigger: string) => text.includes(trigger.toLowerCase())) ||
            AIONLYMODE_RELEASE_TRIGGER.some((trigger: string) => text.includes(trigger.toLowerCase())) ||
            AIONLYMODE_TRIGGER.some((trigger: string) => text.includes(trigger.toLowerCase()))
        );
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const { db } = context;
        const record = event.commit.record as any;
        const text = (record.text || "").toLowerCase();

        if (PREDEFINEDMODE_RELEASE_TRIGGER.some((trigger: string) => text.includes(trigger.toLowerCase()))) {
            await this.handleU18Release(event, db);
            return;
        }
        if (PREDEFINEDMODE_TRIGGER.some((trigger: string) => text.includes(trigger.toLowerCase()))) {
            await this.handleU18Register(event, db);
            return;
        }
        if (AIONLYMODE_TRIGGER.some((trigger: string) => text.includes(trigger.toLowerCase()))) {
            await this.handleAIonlyRegister(event, db);
            return;
        }
        if (AIONLYMODE_RELEASE_TRIGGER.some((trigger: string) => text.includes(trigger.toLowerCase()))) {
            await this.handleAIonlyRelease(event, db);
            return;
        }
    }

    private async handleU18Register(event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
        const record = event.commit.record as Record;
        const langStr = getLangStr(record.langs);

        const TEXT_REGISTER_U18 = (langStr === "日本語") ?
            "定型文モードを設定しました! これからはAIを使わずに全肯定しますね。" :
            "Predefined reply mode enabled! I will give affirmative replies without using AI from now on.";

        return await handleMode(event, {
            db,
            dbColumn: "is_u18",
            dbValue: 1,
            generateText: TEXT_REGISTER_U18,
        });
    }

    private async handleU18Release(event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
        const record = event.commit.record as Record;
        const langStr = getLangStr(record.langs);

        const TEXT_RELEASE_U18 = (langStr === "日本語") ?
            "定型文モードを解除しました! これからはたまにAIを使って全肯定しますね。" :
            "Predefined reply mode disabled! I will sometimes use AI to give affirmative replies from now on.";

        return await handleMode(event, {
            db,
            dbColumn: "is_u18",
            dbValue: 0,
            generateText: TEXT_RELEASE_U18,
        });
    }

    private async handleAIonlyRegister(event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
        const record = event.commit.record as Record;
        const langStr = getLangStr(record.langs);

        const TEXT_REGISTER_AIONLY = (langStr === "日本語") ?
            "AI限定モードを設定しました! これからは定型文を使わずに全肯定しますね。" :
            "AI only mode enabled! I will give affirmative replies using only AI from now on.";

        return await handleMode(event, {
            db,
            dbColumn: "is_ai_only",
            dbValue: 1,
            generateText: TEXT_REGISTER_AIONLY,
        });
    }

    private async handleAIonlyRelease(event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
        const record = event.commit.record as Record;
        const langStr = getLangStr(record.langs);

        const TEXT_RELEASE_AIONLY = (langStr === "日本語") ?
            "AI限定モードを設定しました! これからはたまに定型文を使って全肯定しますね。" :
            "AI only mode disabled! I will sometimes use predefined replies to give affirmative replies from now on.";

        return await handleMode(event, {
            db,
            dbColumn: "is_ai_only",
            dbValue: 0,
            generateText: TEXT_RELEASE_AIONLY,
        });
    }
}
