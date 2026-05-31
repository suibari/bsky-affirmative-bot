import { MemoryService } from '@bsky-affirmative-bot/database';
import { BotDiaryActivity } from '@bsky-affirmative-bot/bot-brain';

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
