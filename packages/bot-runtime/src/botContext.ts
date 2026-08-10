export type RuntimeBotContext = {
  datetime: string;
  weather: string;
  botActivity: string;
  botActivityEn: string;
  botEnergy: number;
  recentActivities?: RuntimeBotActivity[];
};

export type RuntimeBotActivity = {
  at: string;
  activity: string;
  activityEn: string;
};

type BotContextSources = {
  getWeather: () => Promise<string>;
  getStatus: () => Promise<{ mood: string; mood_en: string; energy: number }>;
  getRecentActivities?: () => Promise<RuntimeBotActivity[]>;
};

let sources: BotContextSources | undefined;
let cache:
  { value: Omit<RuntimeBotContext, "datetime">; time: number } | undefined;
const TTL_MS = 5 * 60 * 1000;

export function configureBotContext(value: BotContextSources) {
  sources = value;
}

function dateTime() {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日${now.getHours()}時${now.getMinutes()}分`;
}

export async function getBotContext(): Promise<RuntimeBotContext> {
  if (!sources) throw new Error("Bot context sources are not configured");
  if (!cache || Date.now() - cache.time > TTL_MS) {
    const [weather, status, recentActivities] = await Promise.all([
      sources.getWeather(),
      sources.getStatus(),
      sources.getRecentActivities?.() ?? Promise.resolve([]),
    ]);
    cache = {
      value: {
        weather,
        botActivity: status.mood,
        botActivityEn: status.mood_en,
        botEnergy: status.energy,
        ...(recentActivities.length ? { recentActivities } : {}),
      },
      time: Date.now(),
    };
  }
  return { datetime: dateTime(), ...cache.value };
}
