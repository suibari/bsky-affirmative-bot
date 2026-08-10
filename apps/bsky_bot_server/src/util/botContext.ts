import { getYokohamaWeather } from "@bsky-affirmative-bot/bot-brain";
import { botBiothythmManager, MemoryService } from "@bsky-affirmative-bot/clients";
import {
  configureBotContext,
  getBotContext,
} from "@bsky-affirmative-bot/bot-runtime";

configureBotContext({
  getWeather: getYokohamaWeather,
  getStatus: () => botBiothythmManager.getContext(),
  getRecentActivities: async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await MemoryService.getBiorhythmHistorySince(since);
    return rows.map((row) => ({
      at: new Date(row.created_at).toISOString(),
      activity: row.mood,
      activityEn: row.mood_en || row.mood,
    }));
  },
});

export { getBotContext };
