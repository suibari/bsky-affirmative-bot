import holidays from "../json/holidays.json";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { handleMode, isPast } from ".";
import { ANNIV_CONFIRM_TRIGGER, ANNIV_REGISTER_TRIGGER } from "../config";
import { Record as PostRecord } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { getLangStr, uniteDidNsidRkey } from "../bsky/util";
import { postContinuous } from "../bsky/postContinuous";
import { GeminiResponseResult, Holiday, UserInfoGemini } from "../types";
import { agent } from "../bsky/agent";
import { dateForHoliday, toIsoDateFromDate } from "../util/dateRules";
import { SQLite3 } from "../db";
import { generateAnniversary } from "../gemini/generateAnniversary";

type AnniversaryInfo = {
  name: string;
  date: string; // ISO形式
} | null;

const TEXT_REGISTER_ANNIV = (displayName: string, langStr: string, anniv_name: string, anniv_date: string) => (langStr === "日本語") ? 
`${displayName}さんの記念日「${anniv_name}」は、${anniv_date}って覚えたよ! ${anniv_name}になったらお祝いするから、楽しみに待っててね～` : 
``;

const TEXT_CONFIRM_ANNIV = (displayName: string, langStr: string, anniv_name: string, anniv_date: string) => (langStr === "日本語") ?
`${displayName}さんの記念日「${anniv_name}」は、${anniv_date}って覚えてるよ! ${anniv_name}になったらお祝いするから、楽しみに待っててね～` :
``;

/**
 * 記念日登録
 * @param event 
 * @param db 
 * @returns 
 */
export async function handleAnniversaryRegister (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
  const record = event.commit.record as PostRecord;
  const langStr = getLangStr(record.langs);

  // テキストパース
  const annivInfo = parseAnniversaryCommand(record.text);
  if (!annivInfo) return false; // パース失敗時はリターン

  // 経過判定
  if (!(await isPast(event, db, "last_anniv_registered_at", 6 * 24 * 60))) return false; // 6days経過前はリターン

  // 記念日登録
  console.log(`[INFO][${follower.did}] registered anniversary. ${annivInfo.name}: ${annivInfo.date}`);
  db.updateDb(follower.did, "user_anniv_name", annivInfo.name);
  db.updateDb(follower.did, "user_anniv_at", annivInfo.date);

  // 最終登録日更新とリプライ
  return await handleMode(event, {
    triggers: ANNIV_REGISTER_TRIGGER,
    db,
    dbColumn: "last_anniv_registered_at",
    dbValue: new Date().toISOString(),
    generateText: TEXT_REGISTER_ANNIV(follower.displayName ?? "", langStr, annivInfo?.name, annivInfo?.date),
  })
}

/**
 * 記念日確認
 * @param event 
 * @param follower 
 * @param db 
 * @returns 
 */
export async function handleAnniversaryConfirm(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
  const record = event.commit.record as PostRecord;
  const langStr = getLangStr(record.langs);

  // DB select
  const annivInfo: AnniversaryInfo = {
    name: await db.selectDb(follower.did, "user_anniv_name"),
    date: await db.selectDb(follower.did, "user_anniv_at"),
  }
  if (!annivInfo.name || !annivInfo.date) return false; // 未登録ならリターン

  return await handleMode(event, {
    triggers: ANNIV_CONFIRM_TRIGGER,
    db,
    generateText: TEXT_CONFIRM_ANNIV(follower.displayName ?? "", langStr, annivInfo.name, annivInfo.date),
  });
}

/**
 * 記念日リプライ実行
 * @param event 
 * @param follower 
 * @param db 
 * @returns 
 */
export async function handleAnniversaryExec(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
  const record = event.commit.record as PostRecord;
  const lang = record.langs?.[0];

  // タイムゾーンを考慮した記念日判定
  const todayAnniversary = await getTodayAnniversary(follower, lang, db);
  if (todayAnniversary.length === 0) return false;

  // 今日は記念日であるので、
  // その日の記念日リプライ記録がなければ通過させる
  const todayStr = formatYMD(new Date(), lang);
  const lastAnnivExeced = await db.selectDb(follower.did, "last_anniv_execed_at") as Date;
  const lastStr = formatYMD(new Date(lastAnnivExeced), lang);
  if (todayStr === lastStr) return false;

  // 記念日であり、まだその日実行もしていないなら、記念日リプライする
  console.log(`[INFO][${follower.did}] happy anniversary! ${todayAnniversary.map(item => item.id).join(", ")}`);
  return await handleMode(event, {
    triggers: [], // トリガーワードなし、botへのリプライであれば常に反応
    db,
    dbColumn: "last_anniv_execed_at",
    dbValue: new Date().toISOString(),
    generateText: getAnnivEmbed,
  },
  {
    follower,
    langStr: getLangStr(record.langs),
    anniversary: todayAnniversary,
  });
}

// ---------
async function getAnnivEmbed(userinfo: UserInfoGemini, event: CommitCreateEvent<"app.bsky.feed.post">): Promise<GeminiResponseResult> {
  // 1. ユーザの過去ポスト検索: 去年の同じ月日
  const {since, until} = getDateLastYearsSameMD();
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

  // 2. Gemini
  const botText = await generateAnniversary(userinfo);

  // embedToがなければキー省略
  return {
    text: botText,
    ...(embedTo ? { embedTo } : {}),
  };
}

/**
 * 今日に対応した記念日を取得
 * @param follower 
 * @param db 
 * @returns 
 */
async function getTodayAnniversary(follower: ProfileView, lang: string | undefined, db: SQLite3) {
  let todayAnniversary: Holiday[] = [];

  const today = new Date();
  const todayIso = formatYMD(new Date(), lang);
  // const todayIso = toIsoDateFromDate(today); // "2025-08-29"

  // プリセット記念日判定
  const todayHolidays = (holidays as Holiday[]).filter(h => {
    const d = dateForHoliday(today.getUTCFullYear(), h);
    return toIsoDateFromDate(d) === todayIso;
  });
  todayAnniversary = todayAnniversary.concat(todayHolidays);

  // Bluesky登録日判定
  const createdAtBluesky = follower.createdAt
  if (createdAtBluesky) {
    const createdAtBskyDate = new Date(createdAtBluesky);
    if (toIsoDateFromDate(createdAtBskyDate) === todayIso) {
      todayAnniversary = todayAnniversary.concat({
        "id": "bluesky_registered_day",
        "names": { "ja": "Bluesky登録日", "en": "The Day You Registered With Bluesky" },
        "rule": { "type": "fixed", "month": createdAtBskyDate.getMonth()+1, "day": createdAtBskyDate.getDate() },
        "regions": ["global"]
      })
    }
  }

  // ユーザ記念日判定
  const anniv_name = await db.selectDb(follower.did, "user_anniv_name");
  const anniv_date = await db.selectDb(follower.did, "user_anniv_at");
  if (anniv_name && anniv_date) {
    const userAnnivDate = new Date(anniv_date);
    if (toIsoDateFromDate(userAnnivDate) === todayIso) {
      todayAnniversary = todayAnniversary.concat({
        "id": "user_anniversary",
        "names": { "ja": anniv_name, "en": anniv_name },
        "rule": { "type": "fixed", "month": userAnnivDate.getMonth()+1, "day": userAnnivDate.getDate() },
        "regions": ["global"]
      })
    }
  }

  return todayAnniversary;
}

// 1年前の同じ月日を取得
function getDateLastYearsSameMD() {
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

  return {since, until};
}

// コマンドパース
function parseAnniversaryCommand(input: string): AnniversaryInfo | null {
  // カンマ or 読点で分割
  const parts = input.split(/,|、/).map(p => p.trim()).filter(Boolean);

  if (parts.length >= 3) {
    const name = parts[1];
    const rawDate = parts[2];

    const md = toMonthDay(rawDate);
    if (md) {
      return { name, date: md }; // "MM-DD" 形式で返す
    }
  }

  return null;

  // 月日だけをパース
  function toMonthDay(input: string): string | null {
    // 区切りを統一
    let dateStr = input.replace(/[月\/\-]/g, "-").replace(/日$/, "");

    // M-D または MM-DD にマッチ
    const match = dateStr.match(/^(\d{1,2})-(\d{1,2})$/);
    if (!match) return null;

    const [, month, day] = match;
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);

    // バリデーション
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;

    // "MM-DD" 形式で返す
    return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
}

/**
 * dateをlangに対応したタイムゾーンに変換し、YYYY-MM-DDを得る
 */
function formatYMD(date: Date, lang?: string): string {
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

const localeToTimezone: Record<string, string> = {
  "ja": "Asia/Tokyo",             // 日本
  "en-US": "America/New_York",    // アメリカ東部
  "en-GB": "Europe/London",       // イギリス
  "fr": "Europe/Paris",           // フランス
  "de": "Europe/Berlin",          // ドイツ
  "es": "Europe/Madrid",          // スペイン
  "zh-CN": "Asia/Shanghai",       // 中国本土
  "zh-TW": "Asia/Taipei",         // 台湾
  "ko": "Asia/Seoul",             // 韓国
  "it": "Europe/Rome",            // イタリア
  "ru": "Europe/Moscow",          // ロシア
  "ar": "Asia/Riyadh",            // サウジアラビア（アラビア語圏代表）
  "pt-BR": "America/Sao_Paulo",   // ブラジル（ポルトガル語圏代表）
  "pt-PT": "Europe/Lisbon",       // ポルトガル本国
};
