import { and, eq } from "drizzle-orm";
import {
  db,
  MemoryService,
  nagiActors,
  nagiDiaries,
  nagiProfiles,
} from "@bsky-affirmative-bot/database";
import {
  applyDiaryTitle,
  calculateDelayUntilLocal22,
  getLangStr,
  getTimezoneFromLang,
} from "@bsky-affirmative-bot/clients";
import { generateUserDiary, type DiaryResult } from "@bsky-affirmative-bot/bot-brain";
import type { AppBskyActorDefs } from "@atproto/api";
import { NAGI, type NagiDiary } from "@bsky-affirmative-bot/nagi-lexicon";
import retry from "async-retry";
import { agent } from "./agent.js";
import { clipNagiPostText } from "./nagiPostText.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RESCAN_INTERVAL_MS = 60 * 60 * 1000;

const scheduledTimers = new Map<string, NodeJS.Timeout>(); // 多重スケジュール抑止用

/** 指定タイムゾーンでの "YYYY-MM-DD"。 */
function localDateStr(timezone: string, now = new Date()): string {
  // en-CA は YYYY-MM-DD 形式で返る。
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * 日記レコードの rkey。
 * DID の ":" は rkey に使えないので "_" にする。(subject, date) で一意なので
 * putRecord を何度呼んでも増えない。
 */
function diaryRkey(subject: string, date: string): string {
  return `${subject.replaceAll(":", "_")}-${date}`;
}

async function getDisplayName(did: string): Promise<string> {
  const [[profile], [actor]] = await Promise.all([
    db
      .select({ displayName: nagiProfiles.displayName })
      .from(nagiProfiles)
      .where(eq(nagiProfiles.did, did))
      .limit(1),
    db
      .select({ handle: nagiActors.handle })
      .from(nagiActors)
      .where(eq(nagiActors.did, did))
      .limit(1),
  ]);
  return profile?.displayName || actor?.handle || did;
}

/**
 * 1ユーザー分の日記を書く。
 * ポストではなく com.suibari.nagi.diary レコードを bot のリポジトリに置くので、
 * グローバルタイムラインには出ない。通知は AppView が取り込み時に作る。
 */
export async function processNagiDiary(userDid: string): Promise<void> {
  try {
    console.log(`[INFO][NAGI][${userDid}] Processing diary...`);

    const since = new Date(Date.now() - DAY_MS);
    const recentPosts = await MemoryService.getNagiPostsSince(userDid, since);
    if (recentPosts.length === 0) {
      console.log(`[INFO][NAGI][${userDid}] today's post not found`);
      return;
    }

    const latestLangs = [...recentPosts]
      .reverse()
      .find((post) => Array.isArray(post.langs) && post.langs.length)?.langs as
      | string[]
      | undefined;
    const langStr = getLangStr(latestLangs);
    const timezone = getTimezoneFromLang(latestLangs?.[0]);
    const date = localDateStr(timezone);

    const existing = await db
      .select({ uri: nagiDiaries.uri })
      .from(nagiDiaries)
      .where(
        and(
          eq(nagiDiaries.subjectDid, userDid),
          eq(nagiDiaries.diaryDate, date),
        ),
      )
      .limit(1);
    if (existing[0]) {
      console.log(`[INFO][NAGI][${userDid}] diary for ${date} already exists`);
      return;
    }

    const displayName = await getDisplayName(userDid);
    // generateUserDiary が見るのは displayName だけだが、型は Bluesky の ProfileView。
    const follower: AppBskyActorDefs.ProfileView = {
      did: userDid,
      handle: displayName,
      displayName,
    };

    console.log(`[INFO][NAGI][${userDid}] generating diary...`);
    let diaryResult: DiaryResult;
    try {
      diaryResult = await retry(
        async () => {
          const result = await generateUserDiary({
            follower,
            posts: recentPosts.map((post) => post.text),
            langStr,
          });
          if (!result || result.diary === "") {
            throw new Error("generateUserDiary returned empty");
          }
          return result;
        },
        {
          retries: 3,
          onRetry: (error, attempt) => {
            console.warn(
              `[WARN][NAGI][${userDid}][DIARY] generateUserDiary retry (${attempt}/3): ${String(error)}`,
            );
          },
        },
      );
    } catch (error: any) {
      console.error(
        `[ERROR][NAGI][${userDid}][DIARY] Failed to generate diary after 3 retries:`,
        error.message,
      );
      return;
    }

    const record: NagiDiary = {
      $type: NAGI.diary,
      subject: userDid,
      date,
      text: clipNagiPostText(diaryResult.diary, "DIARY"),
      titleJa: diaryResult.title_ja,
      titleEn: diaryResult.title_en,
      ...(latestLangs?.length ? { langs: latestLangs } : {}),
      createdAt: new Date().toISOString(),
    };

    await retry(
      async () => {
        await agent.api.com.atproto.repo.putRecord({
          repo: process.env.NAGI_BOT_DID!,
          collection: NAGI.diary,
          rkey: diaryRkey(userDid, date),
          validate: false,
          record,
        } as any);
      },
      {
        retries: 2,
        onRetry: (error, attempt) => {
          console.warn(`[WARN][NAGI][${userDid}][DIARY] putRecord retry ${attempt}:`, error);
        },
      },
    );

    // 称号は Bluesky と共通。ラベルは24時間で切れるが、Nagi のバッジ表示元である
    // followers.current_title_* は次の日記まで残る。失敗しても日記自体は成立させる。
    try {
      await applyDiaryTitle(userDid, diaryResult);
    } catch (error: any) {
      console.error(
        `[ERROR][NAGI][BADGE][DIARY] Failed to apply title badge for ${userDid}:`,
        error.message,
      );
    }

    console.log(`[INFO][NAGI][${userDid}] finish to process diary (${date})`);
  } catch (error) {
    console.error(`[ERROR][NAGI][${userDid}] an error occured in diary process:`, error);
  }
}

/** ユーザーのローカル22時に日記処理を1回だけ予約する。 */
function scheduleUserDiary(userDid: string, timezone: string) {
  if (scheduledTimers.has(userDid)) return; // すでにスケジュール済み

  const delay = calculateDelayUntilLocal22(timezone);
  console.log(`[INFO][NAGI][${userDid}] scheduling diary, tz: ${timezone}, next: ${delay}ms`);
  const timer = setTimeout(() => {
    processNagiDiary(userDid)
      .catch((error) => console.error(`[ERROR][NAGI][${userDid}]`, error))
      .finally(() => {
        scheduledTimers.delete(userDid); // 終了後に削除
      });
  }, delay);

  scheduledTimers.set(userDid, timer);
}

/**
 * 直近24hに Nagi へ投稿したユーザー全員をスケジュールする。
 * Bluesky と違い日記モードのオプトインは無く、投稿があれば書く。
 */
async function manageNagiDiarySchedules() {
  const since = new Date(Date.now() - DAY_MS);
  const botDid = process.env.NAGI_BOT_DID;
  const authors = (await MemoryService.getNagiActiveAuthorsSince(since)).filter(
    (did) => did !== botDid,
  );

  if (authors.length === 0) {
    console.log("[INFO][NAGI][DIARY] no active author for diary");
    return;
  }
  console.log(`[INFO][NAGI][DIARY] active authors: ${authors.length}`);

  for (const did of authors) {
    if (scheduledTimers.has(did)) continue;
    try {
      const posts = await MemoryService.getNagiPostsSince(did, since);
      const langs = [...posts]
        .reverse()
        .find((post) => Array.isArray(post.langs) && post.langs.length)?.langs as
        | string[]
        | undefined;
      scheduleUserDiary(did, getTimezoneFromLang(langs?.[0]));
    } catch (error) {
      console.error(`[ERROR][NAGI][${did}] error occur in diary scheduling:`, error);
    }
  }
}

/** 起動時に呼ぶ。以降1時間ごとに対象を組み直す。 */
export async function scheduleAllNagiDiaries() {
  console.log("[INFO][NAGI][DIARY] scheduling all user diary");

  setInterval(() => {
    manageNagiDiarySchedules().catch((error) =>
      console.error("[ERROR][NAGI][DIARY] periodic scheduling failed:", error),
    );
  }, RESCAN_INTERVAL_MS);

  await manageNagiDiarySchedules();
}

/** ユーザーのデータ削除時に、bot のリポジトリからその人の日記を消す。 */
export async function purgeNagiDiaries(userDid: string): Promise<number> {
  const rows = await db
    .select({ uri: nagiDiaries.uri })
    .from(nagiDiaries)
    .where(eq(nagiDiaries.subjectDid, userDid));

  let deleted = 0;
  for (const { uri } of rows) {
    const rkey = uri.split("/").pop();
    if (!rkey) continue;
    try {
      await agent.api.com.atproto.repo.deleteRecord({
        repo: process.env.NAGI_BOT_DID!,
        collection: NAGI.diary,
        rkey,
      });
      deleted += 1;
    } catch (error) {
      console.error(`[ERROR][NAGI][DIARY] Failed to delete diary record ${uri}:`, error);
    }
  }
  // AppView 側の行は deleteAccountData が消すが、レコード削除イベントの取りこぼしに
  // 備えてここでも落としておく。
  await db.delete(nagiDiaries).where(eq(nagiDiaries.subjectDid, userDid));
  return deleted;
}
