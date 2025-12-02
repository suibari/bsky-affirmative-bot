import { CommitCreateEvent } from "@skyware/jetstream";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { BotFeature, FeatureContext } from "./types";
import { logger, botBiothythmManager } from "../index";
import { FORTUNE_TRIGGER } from "../config";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { handleMode, isPast } from "./utils";
import { generateFortuneResult } from "../gemini/generateFortuneResult";
import { getLangStr } from "../bsky/util";
import { UserInfoGemini, GeminiResponseResult } from "../types";
import { textToImageBufferWithBackground } from "../util/canvas";
import { agent } from "../bsky/agent";

export class FortuneFeature implements BotFeature {
    name = "Fortune";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        const text = (record.text || "").toLowerCase();
        return FORTUNE_TRIGGER.some(trigger => text.includes(trigger.toLowerCase()));
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const record = event.commit.record as Record;
        const { db } = context;

        const result = await handleMode(event, {
            triggers: FORTUNE_TRIGGER,
            db,
            dbColumn: "last_uranai_at",
            dbValue: new Date().toISOString(),
            generateText: this.getBlobWithAnalyze.bind(this),
            checkConditionsAND: await isPast(event, db, "last_uranai_at", 8 * 60), // 8hours
        },
            {
                follower,
                langStr: getLangStr(record.langs),
            });

        if (result && logger.checkRPD()) {
            logger.addFortune();
            botBiothythmManager.addFortune();
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
