import { MemoryService } from '@bsky-affirmative-bot/database';
import { BotDiaryActivity } from '@bsky-affirmative-bot/bot-brain';
import { LanguageName, languageData, localeToTimezone } from '@bsky-affirmative-bot/shared-configs';

/**
 * 言語コードからタイムゾーンを取得する。
 * Bluesky・Nagi 双方の日記スケジューラが使う。
 */
export function getTimezoneFromLang(lang: string | undefined): string {
  if (!lang) return 'UTC';
  return localeToTimezone[lang] || 'UTC';
}

/** langs からプロンプト用の言語名を決める。単一言語のときだけそれを採用し、それ以外は英語。 */
export function getLangStr(langs: string[] | undefined): LanguageName {
  const code = langs?.length === 1 ? langs[0] : 'en';
  const name = languageData.find((lang) => lang.code === code)?.name;
  return name ?? languageData.find((lang) => lang.code === 'en')!.name;
}

/**
 * 指定タイムゾーンのローカル22時までの遅延をミリ秒で返す。
 * 22時を過ぎていれば翌日の22時。
 * ローカルの壁時計から求めているので、今から22時までの間に DST 境界を跨ぐ地域では
 * 最大1時間ずれる。スケジューラは1時間ごとに組み直すため実害はない。
 */
export function calculateDelayUntilLocal22(timezone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const at = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  // hourCycle によっては深夜が "24" になるので丸める。
  const secondsOfDay = (at('hour') % 24) * 3600 + at('minute') * 60 + at('second');
  const target = 22 * 3600;
  const delaySeconds = target > secondsOfDay ? target - secondsOfDay : target - secondsOfDay + 86400;
  return delaySeconds * 1000;
}

export interface DiaryData {
  dateStr: string;
  sinceDate: Date;
  activityLogs: BotDiaryActivity[];
  affirmationPosts: string[];
  receivedReplies: string[];
}

export async function fetchDiaryData(locale: string): Promise<DiaryData> {
  const now = new Date();
  const sinceDate = new Date(now);
  if (now.getHours() < 4) {
    sinceDate.setDate(sinceDate.getDate() - 1);
  }
  sinceDate.setHours(4, 0, 0, 0);

  const year = sinceDate.getFullYear();
  const month = String(sinceDate.getMonth() + 1).padStart(2, '0');
  const day = String(sinceDate.getDate()).padStart(2, '0');
  const dateStr = `${year}/${month}/${day}`;

  let rawActivities: any[] = [];
  try {
    rawActivities = await MemoryService.getBiorhythmHistorySince(sinceDate);
  } catch (err) {
    console.error("[ERROR][DIARY] Failed to fetch Biorhythm history:", err);
  }

  const activityLogs: BotDiaryActivity[] = rawActivities.map(a => {
    let timeStr = "";
    try {
      timeStr = new Date(a.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      timeStr = String(a.created_at);
    }
    return { time: timeStr, status: a.status, mood: a.mood, mood_en: a.mood_en ?? undefined };
  });

  let rawInteractions: any[] = [];
  try {
    rawInteractions = await MemoryService.getInteractionsSince(sinceDate);
  } catch (err) {
    console.error("[ERROR][DIARY] Failed to fetch Interactions:", err);
  }

  const affirmationPosts = rawInteractions
    .filter(i => i.type === "NormalReply")
    .map(i => i.details?.text)
    .filter(Boolean) as string[];

  const receivedReplies = rawInteractions
    .filter(i => i.type === "Conversation")
    .map(i => i.details?.text)
    .filter(Boolean) as string[];

  return { dateStr, sinceDate, activityLogs, affirmationPosts, receivedReplies };
}
