import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { BotFeature, FeatureContext } from "./types.js";
import { logger, botBiothythmManager } from "../index.js";
import { FORTUNE_TRIGGER, NICKNAMES_BOT } from "@bsky-affirmative-bot/shared-configs";
import { AppBskyFeedPost } from "@atproto/api"; type Record = AppBskyFeedPost.Record;
import { handleMode, isPast } from "./utils.js";
import { generateFortuneResult } from "@bsky-affirmative-bot/bot-brain";
import { getLangStr, isReplyOrMentionToMe } from "../bsky/util.js";
import { UserInfoGemini, GeminiResponseResult } from "@bsky-affirmative-bot/shared-configs";
import { textToImageBufferWithBackground } from "../util/canvas.js";
import { agent } from "../bsky/agent.js";

export class FortuneFeature implements BotFeature {
    name = "Fortune";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        const text = (record.text || "").toLowerCase();

        const isCalled = isReplyOrMentionToMe(record) || NICKNAMES_BOT.some(elem => text.includes(elem.toLowerCase()));
        if (!isCalled) return false;

        if (!FORTUNE_TRIGGER.some(trigger => text.includes(trigger.toLowerCase()))) return false;

        if (process.env.NODE_ENV !== "development") {
            if (!(await isPast(event, "last_uranai_at", 8 * 60))) return false;
        }

        return true;
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const record = event.commit.record as Record;

        const result = await handleMode(event, {
            dbColumn: "last_uranai_at",
            dbValue: new Date(),
            generateText: this.getBlobWithAnalyze.bind(this),
        },
            {
                follower,
                langStr: getLangStr(record.langs),
            });

        if (result && await logger.checkRPD()) {
            await logger.addFortune();
            await botBiothythmManager.addFortune();
        }
    }

    private async getBlobWithAnalyze(userinfo: UserInfoGemini): Promise<GeminiResponseResult> {
        const TEXT_INTRO_ANALYZE = (userinfo.langStr === "日本語") ?
            `${userinfo.follower.displayName}さんを占ったよ！ 画像を貼るので見てみてね。占いは1日に1回までしかできないので、明日またやってみてね！` :
            `${userinfo.follower.displayName}, I did a fortune reading for you! Check the image. You can only do fortune reading once a day, so try again tommorow!`;

        const result = await generateFortuneResult(userinfo);

        if (process.env.NODE_ENV === "development") {
            console.log("[DEBUG] bot>>> " + result);
        }

        // 画像生成
        const buffer = await textToImageBufferWithBackground(result, "./img/bot-tan-fortune.png");

        // uploadBlod
        const { blob } = (await agent.uploadBlob(buffer, { encoding: "image/png" })).data;

        return {
            text: TEXT_INTRO_ANALYZE,
            imageBlob: blob,
        };
    }
}
