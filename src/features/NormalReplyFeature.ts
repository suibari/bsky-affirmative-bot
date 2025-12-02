import { CommitCreateEvent } from "@skyware/jetstream";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { BotFeature, FeatureContext } from "./types";
import { db } from "../db";
import { logger, botBiothythmManager } from "../index";
import { getSubscribersFromSheet } from "../gsheet";
import { isMention, getLangStr } from "../bsky/util";
import { EXEC_PER_COUNTS } from "../config";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { replyAI } from "./replyai";
import { replyRandom } from "./replyrandom";

const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000;
const MINUTES_THRD_RESPONSE = 10 * 60 * 1000;

export class NormalReplyFeature implements BotFeature {
    name = "NormalReply";
    private count_replyrandom = 0;

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        // Normal post: NOT a reply and NOT a mention
        return !record.reply && !isMention(record);
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const record = event.commit.record as any;
        const did = follower.did;
        const subscribers = await getSubscribersFromSheet();
        let relatedPosts: string[] = [];

        // 確率判定
        const user_freq = await db.selectDb(did, "reply_freq");
        const isValidFreq = this.isJudgeByFreq(user_freq !== null ? Number(user_freq) : 100);
        if (!isValidFreq) {
            console.log(`[INFO][${did}] Ignored post, REASON: freq (user_freq: ${user_freq})`);
            return;
        }

        let replyType: "ai" | "random" | null = null;
        if (subscribers.includes(follower.did)) {
            console.log(`[INFO][${did}] New post: single post by subbed-follower !!`);
            replyType = "ai";
        } else {
            const postedAt = new Date(record.createdAt);
            const updatedAt = new Date(String(await db.selectDb(did, "updated_at")));
            const updatedAtJst = new Date(updatedAt.getTime() + OFFSET_UTC_TO_JST);
            const isPast = postedAt.getTime() - updatedAtJst.getTime() > MINUTES_THRD_RESPONSE;

            if (!isPast) {
                console.log(`[INFO][${did}] Ignored post, REASON: past 10min`);
                return;
            }

            console.log(`[INFO][${did}] New post: single post by NOT subbed-follower !!`);
            const isU18 = (await db.selectDb(did, "is_u18")) ?? 0;
            const isAIOnly = (await db.selectDb(did, "is_ai_only")) ?? 0;

            if (this.count_replyrandom >= EXEC_PER_COUNTS && isU18 === 0) {
                this.count_replyrandom = 0;
                replyType = "ai";
            } else if (isAIOnly === 0) {
                this.count_replyrandom++;
                replyType = "random";
            } else {
                replyType = null;
            }
        }

        if (replyType === "ai" && logger.checkRPD()) {
            await replyAI(follower, event, relatedPosts);
        } else if (replyType === "random") {
            await replyRandom(follower, event);
        } else {
            console.log(`[INFO][${did}] Ignored post, REASON: AI-Only-mode or rpd over`);
            return;
        }

        logger.addAffirmation(did);
        logger.addLang(getLangStr(record.langs));
        botBiothythmManager.addAffirmation(did);

        db.insertOrUpdateDb(did);
    }

    private isJudgeByFreq(probability: number) {
        if (probability < 0 || probability > 100) {
            throw new Error("Probability must be between 0 and 100.");
        }
        return Math.random() * 100 < probability;
    }
}
