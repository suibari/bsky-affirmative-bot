import { CommitCreateEvent } from '@skyware/jetstream';
import { DIARY_REGISTER_TRIGGER, DIARY_RELEASE_TRIGGER } from '../config/index.js';
import { handleMode, isPast } from './index.js';
import { db, SQLite3 } from '../db/index.js';
import { getConcatProfiles } from '../bsky/getConcatProfiles.js';
import { getTodaysAuthorFeed } from '../bsky/getTodaysAuthorFeed.js';
import { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { generateDiary } from '../gemini/generateDiary.js';
import { ProfileView } from '@atproto/api/dist/client/types/app/bsky/actor/defs.js';
import { getLangStr, getTimezoneFromLang } from '../bsky/util.js';
import { postContinuous } from '../bsky/postContinuous.js';
import { agent, createOrRefreshSession } from '../bsky/agent.js';
import { textToImageBufferWithBackground } from '../util/canvas.js';
import { getSubscribersFromSheet } from '../gsheet/index.js'; // Uncommented this import
import { DateTime } from "luxon";
import { LanguageName } from '../types.js';

const TEXT_REGISTER_DIARY = (langStr: LanguageName) => (langStr === "日本語") ?
"日記モードを設定しました! これから毎日、PM10時にあなたの今日のできごとを日記にしてまとめるね!" :
"Diary mode has been enabled! From now on, every day at 10 PM, I'll write a diary of your day's events!";
const TEXT_RELEASE_DIARY = (langStr: LanguageName) => (langStr === "日本語") ?
"日記モードを解除しました! また使ってね!" :
"Diary mode has been disabled! Please use it again!"

const scheduledTimers = new Map<string, NodeJS.Timeout>(); // 多重スケジュール抑止用

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
 * @param db SQLite3 instance.
 */
async function processUserDiary(userDid: string, db: SQLite3) {
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
    const allRecentPosts = await getTodaysAuthorFeed(userDid);

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
    let text_bot = "";
    const maxRetries = 3;
    let retries = 0;
    while (retries < maxRetries) {
      text_bot = await generateDiary({
        follower: profile as ProfileView,
        posts: posts.reverse(),
        langStr,
      });

      if (text_bot !== "") {
        break;
      }

      retries++;
      console.log(`[WARN][${userDid}][DIARY] generateDiary returned empty, retrying (${retries}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }

    if (text_bot === "") {
      console.error(`[ERROR][${userDid}][DIARY] Failed to generate diary after ${maxRetries} retries.`);
      return; // Exit if still empty after retries
    }

    console.log(`[INFO][${userDid}] generating image...`);
    const imageGenerationDate = new Date(); // Use a new Date object for image generation context
    const formattedDate = `${imageGenerationDate.getFullYear()}/${imageGenerationDate.getMonth() + 1}/${imageGenerationDate.getDate()}`;
    const buffer =  await textToImageBufferWithBackground(text_bot + `\n\n${formattedDate}`);
    const {blob} = (await agent.uploadBlob(buffer, {encoding: "image/png"})).data;

    const TEXT_DIARY = (langStr === "日本語") ?
      `${profile.displayName}さんへ、今日の日記をまとめたよ! 画像を貼るので見てみてね。おやすみ～!` :
      `${profile.displayName}, I summarized your diary for today! Check the image. Good night!`;

    await postContinuous(TEXT_DIARY, {
      uri: latestPost.uri,
      cid: latestPost.cid,
      record: latestPost.record as Record
    }, {blob, alt: `Dear ${profile.displayName}, From 全肯定botたん`});

    console.log(`[INFO][${userDid}] finish to process diary`);

  } catch (e: any) {
    console.error(`[ERROR][${userDid}] an error occured in diary process:`, e);
  }
}

/**
 * Schedules the diary processing for a single user for their local 22:00.
 * @param userDid The user's DID.
 * @param timezone The user's timezone.
 * @param db SQLite3 instance.
 */
function scheduleUserDiary(userDid: string, timezone: string, db: SQLite3) {
  if (scheduledTimers.has(userDid)) return; // すでにスケジュール済み

  const delay = calculateDelayUntilLocal22(timezone);
  console.log(`[INFO][${userDid}] scheduling diary, tz: ${timezone}, next: ${delay}ms`);
  const timer = setTimeout(() => {
    processUserDiary(userDid, db)
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
 * @param db SQLite3 instance.
 */
async function manageUserDiarySchedules(db: SQLite3) {
  const usersWithDiaryMode = await db.selectAllDb("is_diary", 1) as string[] | null;

  if (!usersWithDiaryMode || usersWithDiaryMode.length === 0) {
    console.log("[INFO][DIARY] no user for diary mode");
    return;
  }
  console.log(`[INFO][DIARY] is_diary: ${usersWithDiaryMode.length}`);

  // Fetch subscribers from the sheet
  const subscribers = await getSubscribersFromSheet();
  const subscriberSet = new Set(subscribers);
  
  // Filter users to include only those who are subscribers
  const eligibleUsers = usersWithDiaryMode.filter(user => subscriberSet.has(user));
  console.log(`[INFO][DIARY] subbed-follower && is_diary: ${eligibleUsers.length}`);

  for (const userDid of eligibleUsers) { // Iterate over eligibleUsers instead of usersWithDiaryMode
    try {
      // 削除されたユーザなどがいるので、まずgetProfileして確認
      await agent.getProfile({ actor: userDid });

      // Fetch latest post to get language
      // Note: getTodaysAuthorFeed is called here just to get the latest post for language detection.
      // The actual "today's posts" fetching happens in processUserDiary with a specific date.
      const feedForLang = await getTodaysAuthorFeed(userDid);
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
      scheduleUserDiary(userDid, timezone, db);

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
 * @param db SQLite3 instance.
 */
export async function scheduleAllUserDiaries() {
  console.log("[INFO][DIARY] scheduling all user diary");

  // await createOrRefreshSession();

  // Periodically check and update user schedules (e.g., every hour)
  setInterval(async () => {
    console.log("[INFO][DIARY] priodically sheduling set");
    await manageUserDiarySchedules(db);
  }, 60 * 60 * 1000); // Check every hour

  // Initial scheduling
  await manageUserDiarySchedules(db);
}

// --- Original functions that should remain exported ---

export async function handleDiaryRegister (event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
  const record = event.commit.record as Record;
  const langStr = getLangStr(record.langs);

  return await handleMode(event, {
    triggers: DIARY_REGISTER_TRIGGER,
    db,
    dbColumn: "is_diary",
    dbValue: 1,
    generateText: TEXT_REGISTER_DIARY(langStr),
  });
}

export async function handleDiaryRelease (event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
  const record = event.commit.record as Record;
  const langStr = getLangStr(record.langs);

  return await handleMode(event, {
    triggers: DIARY_RELEASE_TRIGGER,
    db,
    dbColumn: "is_diary",
    dbValue: 0,
    generateText: TEXT_RELEASE_DIARY(langStr),
  });
}
