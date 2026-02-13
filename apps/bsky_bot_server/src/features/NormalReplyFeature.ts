import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { BotFeature, FeatureContext } from "./types.js";
import { logger, botBiothythmManager } from "../index.js";
import { getSubscribersFromSheet } from "@bsky-affirmative-bot/bot-brain";
import { isMention, getLangStr } from "../bsky/util.js";
import { EXEC_PER_COUNTS } from "@bsky-affirmative-bot/shared-configs";
import { replyAI } from "./replyai.js";
import { replyRandom } from "./replyrandom.js";
import { MemoryService } from "@bsky-affirmative-bot/clients";

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
        const row = await MemoryService.getFollower(did);
        const user_freq = row?.reply_freq;
        const isValidFreq = this.isJudgeByFreq(user_freq !== null && user_freq !== undefined ? Number(user_freq) : 100);
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
            const updatedAt = new Date(row?.updated_at || 0);
            const updatedAtJst = new Date(updatedAt.getTime() + OFFSET_UTC_TO_JST);
            const isPast = postedAt.getTime() - updatedAtJst.getTime() > MINUTES_THRD_RESPONSE;

            if (!isPast) {
                console.log(`[INFO][${did}] Ignored post, REASON: past 10min`);
                return;
            }

            console.log(`[INFO][${did}] New post: single post by NOT subbed-follower !!`);
            const isU18 = row?.is_u18 ?? 0;
            const isAIOnly = row?.is_ai_only ?? 0;

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

        if (replyType === "ai" && await logger.checkRPD()) {
            await replyAI(follower, event, relatedPosts);
        } else if (replyType === "random") {
            await replyRandom(follower, event);
        } else {
            console.log(`[INFO][${did}] Ignored post, REASON: AI-Only-mode or rpd over`);
            return;
        }

        await logger.addAffirmation(did);
        await botBiothythmManager.addAffirmation(did);
        await logger.addLang(getLangStr(record.langs));

        await MemoryService.upsertFollowerInteraction(did);
    }

    private isJudgeByFreq(probability: number) {
        if (probability < 0 || probability > 100) {
            throw new Error("Probability must be between 0 and 100.");
        }
        return Math.random() * 100 < probability;
    }
}
