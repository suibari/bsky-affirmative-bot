import { CommitCreateEvent } from "@skyware/jetstream";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { BotFeature, FeatureContext } from "./types";
import { logger, botBiothythmManager } from "../index";
import { getSubscribersFromSheet } from "../api/gsheet";
import { CHEER_TRIGGER } from "../config";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { handleMode, isPast } from "./utils";
import { getLangStr, uniteDidNsidRkey } from "../bsky/util";
import { UserInfoGemini, GeminiResponseResult } from "../types";
import { judgeCheerSubject } from "../gemini/judgeCheerSubject";
import { generateCheerResult } from "../gemini/generateCheerResult";
import { repost } from "../bsky/repost";

export class CheerFeature implements BotFeature {
    name = "Cheer";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        const text = (record.text || "").toLowerCase();

        // Check if subscriber
        const subscribers = await getSubscribersFromSheet();
        if (!subscribers.includes(follower.did)) return false;

        // Check trigger
        if (!CHEER_TRIGGER.some(trigger => text.includes(trigger.toLowerCase()))) return false;

        // Check condition (isPast)
        if (process.env.NODE_ENV !== "development") {
            if (!(await isPast(event, context.db, "last_cheer_at", 8 * 60))) return false;
        }

        return true;
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const record = event.commit.record as Record;
        const { db } = context;

        const result = await handleMode(event, {
            db,
            dbColumn: "last_cheer_at",
            dbValue: new Date().toISOString(),
            generateText: this.repostAndGenerate.bind(this),
            disableReply: true,
        },
            {
                follower,
                posts: [record.text],
                langStr: getLangStr(record.langs),
            });

        if (result && logger.checkRPD()) {
            logger.addCheer();
            botBiothythmManager.addCheer();
        }
    }

    private async repostAndGenerate(userinfo: UserInfoGemini, event: CommitCreateEvent<"app.bsky.feed.post">): Promise<GeminiResponseResult | undefined> {
        const uri = uniteDidNsidRkey(event.did, event.commit.collection, event.commit.rkey);
        const cid = String(event.commit.cid);

        const judge = await judgeCheerSubject(userinfo);
        if (!judge.result) {
            console.log(`[INFO][${userinfo.follower.did}] judged as inappropriate post!`);
            console.log(`[INFO] judge>>> ${judge.comment}`);
            return undefined;
        }

        let text: string;
        try {
            text = await generateCheerResult(userinfo);
        } catch (err) {
            console.error(`[ERROR][${userinfo.follower.did}] Failed to generate cheer result:`, err);
            return undefined;
        }

        await repost(uri, cid);

        return text;
    }
}
