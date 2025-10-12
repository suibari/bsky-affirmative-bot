import { CommitCreateEvent } from '@skyware/jetstream';
import { handleMode, isPast } from './index.js';
import { SQLite3 } from '../db/index.js';
import { GeminiResponseResult, UserInfoGemini } from '../types.js';
import { STATUS_CONFIRM_TRIGGER } from '../config/index.js';
import { ProfileView } from '@atproto/api/dist/client/types/app/bsky/actor/defs.js';
import { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { getLangStr } from '../bsky/util.js';

export async function execConfirmStatus (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
  const record = event.commit.record as Record;

  return await handleMode(event, {
    triggers: STATUS_CONFIRM_TRIGGER,
    db,
    dbColumn: "last_status_at",
    dbValue: new Date().toISOString(),
    generateText: buildStatusText,
    checkConditionsAND: await isPast(event, db, "last_status_at", 8 * 60), // 8hours
  } , {
    follower,
    langStr: getLangStr(record.langs),
  });
}

async function buildStatusText(userinfo: UserInfoGemini,  event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3): Promise<GeminiResponseResult | undefined> {
  const rows = await db.getRowById(userinfo.follower.did);

  if (rows) {
    const result = {
      daysFollow: getDaysFromNow(rows.created_at),
      enableAI: (rows.is_u18 === 1) ? "disable" : "enable",
      enablePredefined: (rows.is_ai_only === 1) ? "disable" : "enable",
      replyFreq: rows.reply_freq ?? "100",
      hoursFortune: getHoursFromNow(rows.last_uranai_at),
      convHistory: JSON.parse(rows.conv_history)?.length ?? 0,
      daysAnalyze: getDaysFromNow(rows.last_analyze_at),
      hoursCheer: getHoursFromNow(rows.last_cheer_at),
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

function getDaysFromNow(dateString: string | null | undefined) {
  if (!dateString) return null;

  const createdAt = new Date(dateString);
  if (isNaN(createdAt.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getHoursFromNow(dateString: string | null | undefined) {
  if (!dateString) return null;

  const createdAt = new Date(dateString);
  if (isNaN(createdAt.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60)); // ミリ秒 → 時間
}
