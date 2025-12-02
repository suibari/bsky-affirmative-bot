import { CommitCreateEvent } from "@skyware/jetstream";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { BotFeature, FeatureContext } from "./types";
import { logger, botBiothythmManager } from "../index";
import { ANALYZE_TRIGGER } from "../config";
import retry from 'async-retry';
import { Record as RecordPost } from '@atproto/api/dist/client/types/app/bsky/feed/post';
import { Record as RecordList } from '@atproto/api/dist/client/types/com/atproto/repo/listRecords';
import { agent } from '../bsky/agent';
import { getLangStr } from "../bsky/util";
import { handleMode, isPast } from "./utils";
import { GeminiResponseResult, UserInfoGemini } from '../types';
import { generateAnalyzeResult } from '../gemini/generateAnalyzeResult';
import { textToImageBufferWithBackground } from '../util/canvas';
import { getConcatPosts } from '../bsky/getConcatPosts';
import { AtpAgent } from "@atproto/api";
import { getPds } from '../bsky/getPds';
import { getConcatAuthorFeed } from '../bsky/getConcatAuthorFeed';

export class AnalyzeFeature implements BotFeature {
    name = "Analyze";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        const text = (record.text || "").toLowerCase();
        return ANALYZE_TRIGGER.some(trigger => text.includes(trigger.toLowerCase()));
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const record = event.commit.record as RecordPost;
        const { db } = context;

        const result = await handleMode(event, {
            triggers: ANALYZE_TRIGGER,
            db,
            dbColumn: "last_analyze_at",
            dbValue: new Date().toISOString(),
            generateText: this.getBlobWithAnalyze.bind(this),
            checkConditionsAND: await isPast(event, db, "last_analyze_at", 6 * 24 * 60), // 6days
        },
            {
                follower,
                langStr: getLangStr(record.langs),
            });

        if (result && logger.checkRPD()) {
            logger.addAnalysis();
            botBiothythmManager.addAnalysis();
        }
    }

    private async getBlobWithAnalyze(userinfo: UserInfoGemini): Promise<GeminiResponseResult> {
        const TEXT_INTRO_ANALYZE = (userinfo.langStr === "日本語") ?
            `${userinfo.follower.displayName}さんのポストから、あなたの性格を分析したよ！ 画像を貼るので見てみてね。性格分析は1週間に1回までしかできないので、時間がたったらまたやってみてね！` :
            `${userinfo.follower.displayName}, I analyzed your personality from your posts! Check the image. You can only do personality analysis once a week, so try again after some time!`;

        // ポスト収集
        const feeds = await getConcatAuthorFeed(userinfo.follower.did, 100);
        userinfo.posts = feeds.map(feed => (feed.post.record as RecordPost).text);

        // いいね収集
        const agentPDS = new AtpAgent({ service: await getPds(userinfo.follower.did) });
        const responseLike = await agentPDS.com.atproto.repo.listRecords({
            repo: userinfo.follower.did,
            collection: "app.bsky.feed.like",
            limit: 100,
        });
        const uris = (responseLike.data.records as RecordList[])
            .map(record => (record.value as any).subject.uri);
        const likes = (await getConcatPosts(uris))
            .map(like => (like.record as RecordPost).text);
        userinfo.likedByFollower = likes;

        const result = await retry(async () => {
            const res = await generateAnalyzeResult(userinfo);
            if (!res) {
                throw new Error("API result is empty, retrying...");
            }
            return res;
        }, {
            retries: 3,
            onRetry: (e: unknown, attempt) => {
                if (e instanceof Error) {
                    console.log(`[${new Date().toISOString()}] Attempt ${attempt} failed: ${e.message}`);
                } else {
                    console.log(`[${new Date().toISOString()}] Attempt ${attempt} failed with an unknown error.`);
                }
            }
        });

        if (process.env.NODE_ENV === "development") {
            console.log("[DEBUG] bot>>> " + result);
        }

        // 画像生成
        const buffer = await textToImageBufferWithBackground(result);

        // uploadBlod
        const { blob } = (await agent.uploadBlob(buffer, { encoding: "image/png" })).data;

        return {
            text: TEXT_INTRO_ANALYZE,
            imageBlob: blob,
        };
    }
}
