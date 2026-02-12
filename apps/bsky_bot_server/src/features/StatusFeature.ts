import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { BotFeature, FeatureContext } from "./types.js";
import { STATUS_CONFIRM_TRIGGER, NICKNAMES_BOT } from "@bsky-affirmative-bot/shared-configs";
import { AppBskyFeedPost } from "@atproto/api"; type Record = AppBskyFeedPost.Record;
import { handleMode, isPast } from "./utils.js";
import { getLangStr, isReplyOrMentionToMe } from "../bsky/util.js";
import { MemoryService } from "@bsky-affirmative-bot/clients";
import { GeminiResponseResult, UserInfoGemini } from "../types.js";

export class StatusFeature implements BotFeature {
    name = "Status";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        const text = (record.text || "").toLowerCase();

        const isCalled = isReplyOrMentionToMe(record) || NICKNAMES_BOT.some(elem => text.includes(elem.toLowerCase()));
        if (!isCalled) return false;

        if (!STATUS_CONFIRM_TRIGGER.some(trigger => text.includes(trigger.toLowerCase()))) return false;

        if (process.env.NODE_ENV !== "development") {
            if (!(await isPast(event, "last_status_at", 8 * 60))) return false;
        }

        return true;
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const record = event.commit.record as Record;

        await handleMode(event, {
            dbColumn: "last_status_at",
            dbValue: new Date().toISOString(),
            generateText: this.buildStatusText.bind(this),
        }, {
            follower,
            langStr: getLangStr(record.langs),
        });
    }

    private async buildStatusText(userinfo: UserInfoGemini, event: CommitCreateEvent<"app.bsky.feed.post">): Promise<GeminiResponseResult | undefined> {
        const rows = await MemoryService.getFollower(userinfo.follower.did);

        if (rows) {
            const result = {
                daysFollow: this.getDaysFromNow(rows.created_at),
                enableAI: (rows.is_u18 === 1) ? "disable" : "enable",
                enablePredefined: (rows.is_ai_only === 1) ? "disable" : "enable",
                replyFreq: rows.reply_freq ?? "100",
                hoursFortune: this.getHoursFromNow(rows.last_uranai_at),
                convHistory: JSON.parse(rows.conv_history || "[]").length,
                daysAnalyze: this.getDaysFromNow(rows.last_analyze_at),
                hoursCheer: this.getHoursFromNow(rows.last_cheer_at),
                userAnnivName: rows.user_anniv_name ?? "",
                userAnnivDate: rows.user_anniv_date ?? "",
            }
            return userinfo.langStr === "日本語" ?
                `${userinfo.follower.displayName}さんと、わたしのステータスだよ!\n` +
                `\n` +
                `つきあい: ${result.daysFollow} days\n` +
                `AIリプライ: ${result.enableAI}\n` +
                `定型文リプライ: ${result.enablePredefined}\n` +
                `リプ頻度: ${result.replyFreq} %\n` +
                `占い: ${result.hoursFortune === null || result.hoursFortune >= 8 ? "enable" : "disable (クールタイム中)"}\n` +
                `分析: ${result.daysAnalyze === null || result.daysAnalyze >= 1 ? "enable" : "disable (クールタイム中)"}\n` +
                `応援: ${result.hoursCheer === null || result.hoursCheer >= 8 ? "enable" : "disable (クールタイム中)"}\n` +
                `会話: ${result.convHistory} /100回\n` +
                `ユーザ記念日: ${result.userAnnivName && result.userAnnivDate ? `${result.userAnnivName} on ${result.userAnnivDate}` : ""}\n` :
                `This is the status with ${userinfo.follower.displayName} and me!\n` +
                `\n` +
                `Companionship: ${result.daysFollow} days\n` +
                `Predefined reply: ${result.enableAI}\n` +
                `AI reply: ${result.enablePredefined}\n` +
                `Reply Freq: ${result.replyFreq} %\n` +
                `Fortune: ${result.hoursFortune === null || result.hoursFortune >= 8 ? "enable" : "disable (on cooldown)"}\n` +
                `Analyze: ${result.daysAnalyze === null || result.daysAnalyze >= 1 ? "enable" : "disable (on cooldown)"}\n` +
                `Cheer: ${result.hoursCheer === null || result.hoursCheer >= 8 ? "enable" : "disable (on cooldown)"}\n` +
                `Conversation: ${result.convHistory} /100times\n` +
                `User Anniversary: ${result.userAnnivName && result.userAnnivDate ? `${result.userAnnivName} on ${result.userAnnivDate}` : ""}\n`;
        }
        return undefined
    }

    private getDaysFromNow(dateString: string | null | undefined) {
        if (!dateString) return null;

        const createdAt = new Date(dateString);
        if (isNaN(createdAt.getTime())) return null;

        const now = new Date();
        const diffMs = now.getTime() - createdAt.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    private getHoursFromNow(dateString: string | null | undefined) {
        if (!dateString) return null;

        const createdAt = new Date(dateString);
        if (isNaN(createdAt.getTime())) return null;

        const now = new Date();
        const diffMs = now.getTime() - createdAt.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60)); // ミリ秒 → 時間
    }
}
