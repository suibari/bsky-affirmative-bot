import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { BotFeature, FeatureContext } from "./types.js";
import { botBiothythmManager } from "@bsky-affirmative-bot/clients";
import { isMention, getLangStr, hasNGWord, uniteDidNsidRkey } from "../bsky/util.js";
import { EXEC_PER_COUNTS } from "@bsky-affirmative-bot/shared-configs";
import { replyAI } from "./replyai.js";
import { getConcatAuthorFeed } from "../bsky/getConcatAuthorFeed.js";
import { replyRandom } from "./replyrandom.js";
import { MemoryService } from "@bsky-affirmative-bot/clients";
import retry from 'async-retry';

const MINUTES_THRD_RESPONSE = 10 * 60 * 1000;

let globalNonSubPostCount = 0;

export class NormalReplyFeature implements BotFeature {
    name = "NormalReply";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        // Normal post: NOT a reply and NOT a mention
        return !record.reply && !isMention(record);
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const record = event.commit.record as any;
        const did = follower.did;
        const isSubscriber = context.isSubscriber;
        const row = await MemoryService.getFollower(did);

        let relatedPosts: string[] = [];
        let replyType: "ai" | "random" | null = null;

        // 1. 確率判定 (Frequency check) - 全ユーザー共通
        const user_freq = row?.reply_freq;
        const isValidFreq = this.isJudgeByFreq(user_freq !== null && user_freq !== undefined ? Number(user_freq) : 100);
        if (!isValidFreq) {
            console.log(`[INFO][${did}] Ignored post, REASON: freq (user_freq: ${user_freq})`);
            return;
        }

        // 2. botへの暴言によるブラックリスト状態の取得
        let isBlacklisted = false;
        const replyRecord = await MemoryService.getReply(did);
        if (replyRecord && replyRecord.reply && replyRecord.updated_at) {
            if (hasNGWord(replyRecord.reply)) {
                const now = new Date().getTime();
                const lastReplyTime = new Date(replyRecord.updated_at).getTime();
                if ((now - lastReplyTime) / (1000 * 60 * 60) < 24) {
                    isBlacklisted = true;
                }
            }
        }

        // 3. メインロジック
        if (isSubscriber) {
            // サブスクユーザー: ブラックリストに関わらず常にAIリプライ
            console.log(`[INFO][${did}] New post: single post by subbed-follower !!`);
            replyType = "ai";
        } else {
            // 非サブスクユーザー
            // 10分間のインターバルチェック
            const postedAt = new Date(record.createdAt);
            const updatedAt = new Date(row?.updated_at || 0);
            if (postedAt.getTime() - updatedAt.getTime() <= MINUTES_THRD_RESPONSE) {
                console.log(`[INFO][${did}] Ignored post, REASON: past 10min`);
                return;
            }

            if (isBlacklisted) {
                // ブラックリスト入り: 強制的に定型文（ランダム）
                console.log(`[INFO][${did}] New post: blacklisted non-subscriber, forcing random reply`);
                replyType = "random";
            } else {
                // 通常の非サブスク判定
                const isU18 = row?.is_u18 ?? 0;
                const isAIOnly = row?.is_ai_only ?? 0;

                if (isU18 === 1) {
                    // U18ユーザーは常に定型文
                    console.log(`[INFO][${did}] New post: U18 user, forcing random reply`);
                    replyType = "random";
                } else {
                    // 一般ユーザー：カウントアップしてAIか定型文かを判定
                    console.log(`[INFO][${did}] New post: single post by NOT subbed-follower !!`);
                    globalNonSubPostCount++;
                    if (globalNonSubPostCount % EXEC_PER_COUNTS === 0) {
                        console.log(`[INFO][${did}] AI reply triggered by count (${globalNonSubPostCount})`);
                        replyType = "ai";
                    } else if (isAIOnly === 0) {
                        replyType = "random";
                    } else {
                        console.log(`[INFO][${did}] Ignored post, REASON: AI-Only-mode`);
                        replyType = null;
                    }
                }
            }
        }

        if (replyType === "ai") {
            if (await MemoryService.checkRPD()) {
                try {
                    const recentPosts = await getConcatAuthorFeed(follower.did, 11);
                    const currentUri = uniteDidNsidRkey(follower.did, event.commit.collection, event.commit.rkey);
                    const filtered = recentPosts.filter(item => item.post.uri !== currentUri);
                    relatedPosts = filtered.slice(0, 10).map(item => (item.post.record as any).text).filter(Boolean);
                } catch (err) {
                    console.warn(`[WARN][${did}] Failed to fetch recent posts for relatedPosts context:`, err);
                }

                try {
                    await retry(
                        async () => {
                            await replyAI(follower, event, relatedPosts, isSubscriber);
                        },
                        {
                            retries: 2, // 計3回 (初回 + 2回リトライ)
                            factor: 1,
                            minTimeout: 1000,
                            onRetry: (err: any, attempt: number) => {
                                console.warn(`[WARN][${did}] replyAI attempt ${attempt} failed. Retrying... Error: ${err.message}`);
                            }
                        }
                    );
                } catch (err: any) {
                    console.error(`[ERROR][${did}] Gemini reply failed after all retries. Falling back to replyRandom. Error:`, err.message);
                    await replyRandom(follower, event);
                }
            } else {
                console.log(`[INFO][${did}] Ignored post, REASON: rpd over`);
                return;
            }
        } else if (replyType === "random") {
            await replyRandom(follower, event);
        } else {
            console.log(`[INFO][${did}] Ignored post, REASON: AI-Only-mode`);
            return;
        }

        await MemoryService.addAffirmation({ did });
        await botBiothythmManager.addAffirmation(did);
        await MemoryService.incrementLang(getLangStr(record.langs) as any);

        await MemoryService.upsertFollowerInteraction(did);
    }

    private isJudgeByFreq(probability: number) {
        if (probability < 0 || probability > 100) {
            throw new Error("Probability must be between 0 and 100.");
        }
        return Math.random() * 100 < probability;
    }
}
