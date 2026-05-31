import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { BotFeature, FeatureContext } from "./types.js";

import { DIARY_REGISTER_TRIGGER, DIARY_RELEASE_TRIGGER } from "@bsky-affirmative-bot/shared-configs";
import { AppBskyFeedPost } from "@atproto/api"; type Record = AppBskyFeedPost.Record;
import { handleMode } from "./utils.js";
import { getLangStr, getTimezoneFromLang, sanitizeDidToLexiconValue } from "../bsky/util.js";
import { MemoryService, botLabelerManager } from "@bsky-affirmative-bot/clients";
import { LanguageName } from "@bsky-affirmative-bot/shared-configs";
import { DateTime } from "luxon";
import { getConcatProfiles } from "../bsky/getConcatProfiles.js";
import { getDaysAuthorFeed } from "../bsky/getDaysAuthorFeed.js";
import { generateUserDiary, DiaryResult } from "@bsky-affirmative-bot/bot-brain";
import { textToImageBufferWithBackground } from "../util/canvas.js";
import { agent } from "../bsky/agent.js";
import { postContinuous } from "../bsky/postContinuous.js";

const TEXT_REGISTER_DIARY = (langStr: LanguageName) => (langStr === "日本語") ?
    "日記モードを設定しました! これから毎日、PM10時にあなたの今日のできごとを日記にしてまとめるね!" :
    "Diary mode has been enabled! From now on, every day at 10 PM, I'll write a diary of your day's events!";

const TEXT_RELEASE_DIARY = (langStr: LanguageName) => (langStr === "日本語") ?
    "日記モードを解除しました! また使ってね!" :
    "Diary mode has been disabled! Please use it again!"

const scheduledTimers = new Map<string, NodeJS.Timeout>(); // 多重スケジュール抑止用

export class DiaryFeature implements BotFeature {
    name = "Diary";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        const text = (record.text || "").toLowerCase();

        if (!context.isSubscriber) return false;

        return (
            DIARY_REGISTER_TRIGGER.some(trigger => text.includes(trigger.toLowerCase())) ||
            DIARY_RELEASE_TRIGGER.some(trigger => text.includes(trigger.toLowerCase()))
        );
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        if (await this.handleDiaryRegister(event)) return;
        if (await this.handleDiaryRelease(event)) return;
    }

    private async handleDiaryRegister(event: CommitCreateEvent<"app.bsky.feed.post">) {
        const record = event.commit.record as Record;
        const langStr = getLangStr(record.langs);

        return await handleMode(event, {
            dbColumn: "is_diary",
            dbValue: 1,
            generateText: TEXT_REGISTER_DIARY(langStr),
        });
    }

    private async handleDiaryRelease(event: CommitCreateEvent<"app.bsky.feed.post">) {
        const record = event.commit.record as Record;
        const langStr = getLangStr(record.langs);

        return await handleMode(event, {
            dbColumn: "is_diary",
            dbValue: 0,
            generateText: TEXT_RELEASE_DIARY(langStr),
        });
    }
}

/**
 * 指定タイムゾーンのローカル時間で22時までの遅延時間をミリ秒で取得
 * @param timezone Asia/Tokyo など
 */
export function calculateDelayUntilLocal22(timezone: string): number {
    // 現在時刻を指定タイムゾーンで取得
    const now = DateTime.now().setZone(timezone);

    // 今日の22時を取得
    let target = now.set({ hour: 22, minute: 0, second: 0, millisecond: 0 });

    // すでに22時を過ぎていれば、明日の22時にする
    if (now >= target) {
        target = target.plus({ days: 1 });
    }

    // 遅延時間（ミリ秒）を返す
    return target.toMillis() - now.toMillis();
}

/**
 * Processes the diary for a single user.
 * @param userDid The user's DID.
 */
async function processUserDiary(userDid: string) {
    try {
        console.log(`[INFO][${userDid}] Processing diary...`);

        // ユーザープロフィールを取得
        const profiles = await getConcatProfiles({ actors: [userDid] });
        if (!profiles || profiles.length === 0) {
            console.log(`[INFO][${userDid}] not found profile`);
            return;
        }
        const profile = profiles[0];

        // 本関数実行時から24h前までのポストを収集
        const allRecentPosts = await getDaysAuthorFeed(userDid);

        if (allRecentPosts.length === 0) {
            console.log(`[INFO][${userDid}] today's post not found`);
            // Removed self-scheduling from here. The higher-level scheduler will handle re-scheduling.
            return;
        }

        const posts = allRecentPosts.map(item => (item.post.record as Record).text);
        const latestPost = allRecentPosts.find(item => !item.reply)?.post;

        if (!latestPost) {
            console.log(`[INFO][${userDid}] all posts are reply`);
            // Removed self-scheduling from here.
            return;
        }
        const langStr = getLangStr((latestPost.record as Record).langs);

        console.log(`[INFO][${userDid}] generating diary...`);

        // 日記が空文字のことがあるので、リトライ処理を入れてみる
        let diaryResult: DiaryResult | undefined;
        const maxRetries = 3;
        let retries = 0;
        while (retries < maxRetries) {
            diaryResult = await generateUserDiary({
                follower: profile as ProfileView,
                posts: posts.reverse(),
                langStr,
            });

            if (diaryResult && diaryResult.diary !== "") {
                break;
            }

            retries++;
            console.log(`[WARN][${userDid}][DIARY] generateUserDiary returned empty, retrying (${retries}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }

        if (!diaryResult || diaryResult.diary === "") {
            console.error(`[ERROR][${userDid}][DIARY] Failed to generate diary after ${maxRetries} retries.`);
            return; // Exit if still empty after retries
        }

        const text_bot = diaryResult.diary;

        console.log(`[INFO][${userDid}] generating image...`);
        const imageGenerationDate = new Date(); // Use a new Date object for image generation context
        const formattedDate = `${imageGenerationDate.getFullYear()}/${imageGenerationDate.getMonth() + 1}/${imageGenerationDate.getDate()}`;
        const buffer = await textToImageBufferWithBackground(text_bot + `\n\n${formattedDate}`);
        const { blob } = (await agent.uploadBlob(buffer, { encoding: "image/png" })).data;

        let replyText = (langStr === "日本語") ?
            `${profile.displayName}さんへ、今日の日記をまとめたよ! 画像を貼るので見てみてね。おやすみ～!` :
            `${profile.displayName}, I summarized your diary for today! Check the image. Good night!`;

        // 称号バッジ (日記) 適用処理
        try {
            await MemoryService.ensureFollower(userDid);
            const badgeId = `title-${sanitizeDidToLexiconValue(userDid)}`;
            console.log(`[INFO][BADGE][DIARY] Upserting title badge definition for ${userDid}: ${diaryResult.title_ja} / ${diaryResult.title_en}`);

            // 1. レーベラーに定義を upsert
            await botLabelerManager.upsertLabelDefinition(badgeId, [
                {
                    lang: "ja",
                    name: `称号: ${diaryResult.title_ja}`,
                    description: `前日の日記の総括：${diaryResult.title_ja}`
                },
                {
                    lang: "en",
                    name: `Title: ${diaryResult.title_en}`,
                    description: `Daily Summary: ${diaryResult.title_en}`
                }
            ]);

            // 2. 24時間の有効期限を計算
            const expDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            // 3. ユーザーに24時間限定バッジを適用
            await botLabelerManager.applyLabel(userDid, badgeId, false, expDate);

            // 4. DB 更新
            await MemoryService.updateFollower(userDid, "current_title_ja", diaryResult.title_ja);
            await MemoryService.updateFollower(userDid, "current_title_en", diaryResult.title_en);
            console.log(`[INFO][BADGE][DIARY] Successfully applied title badge ${badgeId} to ${userDid} with exp=${expDate}`);

            // 成功メッセージの追加
            if (langStr === "日本語") {
                replyText += `\n\n🎉「${diaryResult.title_ja}」の称号バッジをプレゼントしたよ！\n※バッジを表示するにはラベラー（ https://bsky.app/profile/labeler-bot-tan.suibari.com ）を登録してね`;
            } else {
                replyText += `\n\n🎉 I've gifted you the title badge "${diaryResult.title_en}"!\n*To show the badge, please subscribe to the labeler ( https://bsky.app/profile/labeler-bot-tan.suibari.com ).`;
            }
        } catch (badgeErr: any) {
            console.error(`[ERROR][BADGE][DIARY] Failed to apply title badge for ${userDid}:`, badgeErr.message);
        }

        // ポスト
        await postContinuous(replyText, {
            uri: latestPost.uri,
            cid: latestPost.cid,
            record: latestPost.record as Record
        }, { blob, alt: `Dear ${profile.displayName}, From 全肯定botたん` });

        console.log(`[INFO][${userDid}] finish to process diary`);

    } catch (e: any) {
        console.error(`[ERROR][${userDid}] an error occured in diary process:`, e);
    }
}

/**
 * Schedules the diary processing for a single user for their local 22:00.
 * @param userDid The user's DID.
 * @param timezone The user's timezone.
 */
function scheduleUserDiary(userDid: string, timezone: string) {
    if (scheduledTimers.has(userDid)) return; // すでにスケジュール済み

    const delay = calculateDelayUntilLocal22(timezone);
    console.log(`[INFO][${userDid}] scheduling diary, tz: ${timezone}, next: ${delay}ms`);
    const timer = setTimeout(() => {
        processUserDiary(userDid)
            .catch(err => console.error(`[ERROR][${userDid}]`, err))
            .finally(() => {
                scheduledTimers.delete(userDid); // 終了後に削除
            });
    }, delay);

    scheduledTimers.set(userDid, timer);
}

/**
 * Manages all user diary schedules. Fetches users, determines their timezone,
 * calculates delays, and schedules their diary processing.
 * This function is intended to be called periodically to ensure all users are scheduled.
 */
async function manageUserDiarySchedules() {
    const usersWithDiaryMode = await MemoryService.getFollowersByColumn("is_diary", 1);

    if (!usersWithDiaryMode || usersWithDiaryMode.length === 0) {
        console.log("[INFO][DIARY] no user for diary mode");
        return;
    }
    console.log(`[INFO][DIARY] is_diary: ${usersWithDiaryMode.length}`);

    // Fetch subscribers from the database
    const subscribers = await MemoryService.getSubscribersOrDeveloper();
    const subscriberSet = new Set(subscribers);

    // Filter users to include only those who are subscribers
    const eligibleUsers = usersWithDiaryMode.filter(user => subscriberSet.has(user.did));
    console.log(`[INFO][DIARY] subbed-follower && is_diary: ${eligibleUsers.length}`);

    for (const user of eligibleUsers) { // Iterate over eligibleUsers instead of usersWithDiaryMode
        const userDid = user.did; // Extract did from the user object
        try {
            // 削除されたユーザなどがいるので、まずgetProfileして確認
            await agent.getProfile({ actor: userDid });

            // Fetch latest post to get language
            // Note: getTodaysAuthorFeed is called here just to get the latest post for language detection.
            // The actual "today's posts" fetching happens in processUserDiary with a specific date.
            const feedForLang = await getDaysAuthorFeed(userDid);
            const latestPost = feedForLang.find(item => !item.reply)?.post;
            if (!latestPost) {
                console.log(`[INFO][${userDid}] latest post not found`);
                continue;
            }
            const lang = (latestPost.record as Record).langs?.[0];
            // console.log(`[DEBUG][${userDid}] lang: ${lang}`);
            const timezone = getTimezoneFromLang(lang);

            // Schedule the user's diary processing if not already scheduled.
            // For simplicity, we'll just schedule it. A more robust system would track scheduled timers.
            scheduleUserDiary(userDid, timezone);

        } catch (e: any) {
            if (e.error === 'AccountDeactivated') {
                console.log(`[INFO][${userDid}] account deactivated, skipping...`);
                continue;
            }
            if (e.error === 'AccountTakedown') {
                console.log(`[INFO][${userDid}] account was takedown, skipping...`);
                continue;
            }
            if (e.error === 'BlockedByActor') {
                console.log(`[INFO][${userDid}] account blocked bot, skipping...`);
                continue;
            }
            console.error(`[ERROR][${userDid}] error occur in diary scheduling:`, e);
        }
    }
}

/**
 * Main scheduler function. Called on application startup.
 * Sets up periodic checks for user schedules and initial scheduling.
 */
export async function scheduleAllUserDiaries() {
    console.log("[INFO][DIARY] scheduling all user diary");

    // await createOrRefreshSession();

    // Periodically check and update user schedules (e.g., every hour)
    setInterval(async () => {
        console.log("[INFO][DIARY] priodically sheduling set");
        await manageUserDiarySchedules();
    }, 60 * 60 * 1000); // Check every hour

    // Initial scheduling
    await manageUserDiarySchedules();
}
