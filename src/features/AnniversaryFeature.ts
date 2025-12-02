import { CommitCreateEvent } from "@skyware/jetstream";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { BotFeature, FeatureContext } from "./types";
import { SQLite3 } from "../db";
import { logger, botBiothythmManager } from "../index";
import { getLangStr } from "../bsky/util";
import { ANNIV_REGISTER_TRIGGER, ANNIV_CONFIRM_TRIGGER } from "../config";
import holidays from "../json/holidays.json";
import { handleMode, isPast } from "./utils";
import { Record as PostRecord } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { GeminiResponseResult, Holiday, localeToTimezone, UserInfoGemini } from "../types";
import { agent } from "../bsky/agent";
import { dateForHoliday, parseMonthDay, toMonthDayIso } from "../util/dateRules";
import { generateAnniversary } from "../gemini/generateAnniversary";

type AnniversaryInfo = {
    name: string;
    date: string; // ISO形式
} | null;

const TEXT_REGISTER_ANNIV = (displayName: string, langStr: string, anniv_name: string, anniv_date: string) => (langStr === "日本語") ?
    `${displayName}さんの記念日「${anniv_name}」は、${anniv_date}って覚えたよ! ${anniv_name}になったらお祝いするから、楽しみに待っててね～` :
    `I remembered that ${displayName}'s anniversary, "${anniv_name}," is ${anniv_date}! We'll celebrate on ${anniv_name}, so look forward to it!`;

const TEXT_CONFIRM_ANNIV = (displayName: string, langStr: string, anniv_name: string, anniv_date: string) => (langStr === "日本語") ?
    `${displayName}さんの記念日「${anniv_name}」は、${anniv_date}って覚えてるよ! ${anniv_name}になったらお祝いするから、楽しみに待っててね～` :
    `I remember that ${displayName}'s anniversary, ${anniv_name}, is ${anniv_date}! I'll celebrate on ${anniv_name}, so look forward to it!`;

export class AnniversaryFeature implements BotFeature {
    name = "Anniversary";
    private processingUsers = new Map<string, boolean>();

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        const text = (record.text || "").toLowerCase();
        const lang = getLangStr(record.langs);

        return (
            ANNIV_REGISTER_TRIGGER.some(trigger => text.includes(trigger.toLowerCase())) ||
            ANNIV_CONFIRM_TRIGGER.some(trigger => text.includes(trigger.toLowerCase())) ||
            await this.shouldExecuteAnniversary(follower, context.db, lang)
        );
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const { db } = context;

        // Priority 1: Exec (Automatic celebration)
        if (await this.handleAnniversaryExec(event, follower, db) && logger.checkRPD()) {
            logger.addAnniversary();
            botBiothythmManager.addAnniversary();
            return;
        }

        // Priority 2: Register
        if (await this.handleAnniversaryRegister(event, follower, db)) return;

        // Priority 3: Confirm
        if (await this.handleAnniversaryConfirm(event, follower, db)) return;
    }

    private async shouldExecuteAnniversary(follower: ProfileView, db: SQLite3, lang: string): Promise<boolean> {
        const todayAnniversary = await this.getTodayAnniversary(follower, lang, db);
        if (todayAnniversary.length === 0) return false;

        const todayStr = this.formatYMD(new Date(), lang);
        const lastAnnivExeced = await db.selectDb(follower.did, "last_anniv_execed_at") as Date;
        const lastStr = this.formatYMD(new Date(lastAnnivExeced), lang);

        return todayStr !== lastStr;
    }

    private async handleAnniversaryRegister(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
        const record = event.commit.record as PostRecord;
        const langStr = getLangStr(record.langs);

        // テキストパース
        const annivInfo = this.parseAnniversaryCommand(record.text);
        if (!annivInfo) return false; // パース失敗時はリターン

        // 経過判定
        if (!(await isPast(event, db, "last_anniv_registered_at", 6 * 24 * 60))) return false; // 6days経過前はリターン

        // 最終登録日更新とリプライ
        const result = await handleMode(event, {
            triggers: ANNIV_REGISTER_TRIGGER,
            db,
            dbColumn: "last_anniv_registered_at",
            dbValue: new Date().toISOString(),
            generateText: TEXT_REGISTER_ANNIV(follower.displayName ?? "", langStr, annivInfo?.name, annivInfo?.date),
        });

        // handleModeに失敗したときはreturnしておく
        if (!result) return false;

        // 記念日登録
        console.log(`[INFO][${follower.did}] registered anniversary. ${annivInfo.name}: ${annivInfo.date}`);
        db.updateDb(follower.did, "user_anniv_name", annivInfo.name);
        db.updateDb(follower.did, "user_anniv_date", `--${annivInfo.date}`); // ISO年無し表記で保存(--MM-DD)

        return result;
    }

    private async handleAnniversaryConfirm(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
        const record = event.commit.record as PostRecord;
        const langStr = getLangStr(record.langs);

        // DB select
        const annivInfo: AnniversaryInfo = {
            name: await db.selectDb(follower.did, "user_anniv_name"),
            date: await db.selectDb(follower.did, "user_anniv_date"),
        }
        if (!annivInfo.name || !annivInfo.date) return false; // 未登録ならリターン

        return await handleMode(event, {
            triggers: ANNIV_CONFIRM_TRIGGER,
            db,
            generateText: TEXT_CONFIRM_ANNIV(follower.displayName ?? "", langStr, annivInfo.name, annivInfo.date),
        });
    }

    private async handleAnniversaryExec(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
        const record = event.commit.record as PostRecord;
        const lang = record.langs?.[0];

        // Check if user is already being processed
        if (this.processingUsers.has(follower.did)) {
            console.log(`[INFO][${follower.did}] Already processing anniversary, skipping.`);
            return false;
        }

        // Mark user as processing
        this.processingUsers.set(follower.did, true);

        try {
            // タイムゾーンを考慮した記念日判定
            const todayAnniversary = await this.getTodayAnniversary(follower, lang, db);
            if (todayAnniversary.length === 0) return false;

            // 今日は記念日であるので、
            // その日の記念日リプライ記録がなければ通過させる
            const todayStr = this.formatYMD(new Date(), lang);
            const lastAnnivExeced = await db.selectDb(follower.did, "last_anniv_execed_at") as Date;
            const lastStr = this.formatYMD(new Date(lastAnnivExeced), lang);
            if (todayStr === lastStr) return false;

            // 記念日であり、まだその日実行もしていないなら、記念日リプライする
            console.log(`[INFO][${follower.did}] happy ANNIVERSARY!, id: ${todayAnniversary.map(item => item.id).join(", ")}`);
            return await handleMode(event, {
                triggers: [], // トリガーワードなし、OR条件を満たせば常に反応
                db,
                dbColumn: "last_anniv_execed_at",
                dbValue: new Date().toISOString(),
                generateText: this.getAnnivEmbed.bind(this),
                checkConditionsOR: (!record.reply), // callbackPostより、通常ポストか、botへのメンションに対し反応する
            },
                {
                    follower,
                    langStr: getLangStr(record.langs),
                    anniversary: todayAnniversary,
                });
        } finally {
            // Remove user from processing map after operation is complete
            this.processingUsers.delete(follower.did);
        }
    }

    private async getAnnivEmbed(userinfo: UserInfoGemini, event: CommitCreateEvent<"app.bsky.feed.post">): Promise<GeminiResponseResult> {
        // 1. ユーザの過去ポスト検索: 去年の同じ月日
        const { since, until } = this.getDateLastYearsSameMD();
        const response = await agent.app.bsky.feed.searchPosts({
            q: "*",
            sort: 'top',
            since: since.toISOString(),
            until: until.toISOString(),
            author: userinfo.follower.did,
        })
        const embedTo = (response.data.posts.length > 0) ? {
            uri: response.data.posts[0].uri,
            cid: response.data.posts[0].cid,
        } : undefined;
        userinfo.posts = response.data.posts.map(post => (post.record as PostRecord).text);
        // console.log(`[DEBUG][${event.did}] last year post: ${userinfo.posts[0]}`);

        // 2. Gemini
        const botText = await generateAnniversary(userinfo);

        if (process.env.NODE_ENV === "development") {
            console.log("[DEBUG] bot>>> " + botText);
        }

        // embedToがなければキー省略
        return {
            text: botText,
            ...(embedTo ? { embedTo } : {}),
        };
    }

    private async getTodayAnniversary(follower: ProfileView, lang: string | undefined, db: SQLite3) {
        let todayAnniversary: Holiday[] = [];

        const today = new Date();
        const todayIso = this.formatYMD(new Date(), lang); // 2025-08-29
        const todayMD = "--" + todayIso.slice(5);     //    --08-29

        // プリセット記念日判定
        const todayHolidays = (holidays as Holiday[]).filter(h => {
            const d = dateForHoliday(today.getUTCFullYear(), h);
            return toMonthDayIso(d) === todayMD;
        });
        todayAnniversary = todayAnniversary.concat(todayHolidays);

        // Bluesky登録日判定
        const createdAtBluesky = follower.createdAt
        if (createdAtBluesky) {
            const createdAtBskyDate = new Date(createdAtBluesky);
            const createdAtBskyYMD = this.formatYMD(createdAtBskyDate, lang);
            // 今日登録した場合は除外
            if (createdAtBskyYMD !== todayIso && !isNaN(createdAtBskyDate.getTime()) && toMonthDayIso(createdAtBskyDate) === todayMD) {
                todayAnniversary = todayAnniversary.concat({
                    "id": "bluesky_registered_day",
                    "names": { "ja": "Bluesky登録日", "en": "The Day You Registered With Bluesky" },
                    "rule": { "type": "fixed", "month": createdAtBskyDate.getMonth() + 1, "day": createdAtBskyDate.getDate() },
                    "regions": ["global"]
                })
            }
        }

        // ユーザ記念日判定
        const anniv_name = await db.selectDb(follower.did, "user_anniv_name");
        const anniv_date = await db.selectDb(follower.did, "user_anniv_date");
        if (anniv_name && anniv_date) {
            const userAnnivDate = parseMonthDay(anniv_date);
            if (userAnnivDate && toMonthDayIso(userAnnivDate) === todayMD) {
                todayAnniversary = todayAnniversary.concat({
                    "id": "user_anniversary",
                    "names": { "ja": anniv_name, "en": anniv_name },
                    "rule": { "type": "fixed", "month": userAnnivDate.getMonth() + 1, "day": userAnnivDate.getDate() },
                    "regions": ["global"]
                })
            }
        }

        return todayAnniversary;
    }

    private getDateLastYearsSameMD() {
        const now = new Date();

        // 去年の同じ月日
        const lastYear = new Date(
            now.getFullYear() - 1,
            now.getMonth(),
            now.getDate()
        );

        // since = その日の 0:00:00 UTC
        const since = new Date(lastYear);
        since.setUTCHours(0, 0, 0, 0);

        // until = 翌日の 0:00:00 UTC
        const until = new Date(lastYear);
        until.setUTCHours(24, 0, 0, 0);

        return { since, until };
    }

    private parseAnniversaryCommand(input: string): AnniversaryInfo | null {
        // カンマ or 読点で分割
        const parts = input.split(/,|、/).map(p => p.trim()).filter(Boolean);

        if (parts.length >= 3) {
            const name = parts[1];
            const rawDate = parts[2];

            const md = this.toMonthDay(rawDate);
            if (md) {
                return { name, date: md }; // "MM-DD" 形式で返す
            }
        }

        return null;
    }

    private toMonthDay(input: string): string | null {
        // 区切りを統一
        let dateStr = input.replace(/[年月\/\-]/g, "-").replace(/日/g, "");

        // テキスト混じりでも最初に出た M-D を抽出
        const match = dateStr.match(/(\d{1,2})-(\d{1,2})/);
        if (!match) return null;

        const [, month, day] = match;
        const m = parseInt(month, 10);
        const d = parseInt(day, 10);

        if (m < 1 || m > 12 || d < 1 || d > 31) return null;

        return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }

    private formatYMD(date: Date, lang?: string): string {
        const tz = localeToTimezone[lang ?? ""] ?? "UTC";

        const parts = new Intl.DateTimeFormat("en-CA", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZone: tz,
        }).formatToParts(date);

        const y = parts.find(p => p.type === "year")?.value;
        const m = parts.find(p => p.type === "month")?.value;
        const d = parts.find(p => p.type === "day")?.value;

        return `${y}-${m}-${d}`;
    }
}
