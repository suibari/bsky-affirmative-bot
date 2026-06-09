import { getYokohamaWeather } from "@bsky-affirmative-bot/bot-brain";
import { botBiothythmManager } from "@bsky-affirmative-bot/clients";
import { getFullDateAndTimeString, BotContext } from "@bsky-affirmative-bot/shared-configs";

let _cache: { value: Omit<BotContext, 'datetime'>; time: number } | null = null;
const TTL = 5 * 60 * 1000;

export async function getBotContext(): Promise<BotContext> {
    if (!_cache || Date.now() - _cache.time > TTL) {
        const [weather, status] = await Promise.all([
            getYokohamaWeather(),
            botBiothythmManager.getContext(),
        ]);
        _cache = {
            value: {
                weather,
                botActivity: status.mood,
                botActivityEn: status.mood_en,
                botEnergy: status.energy,
            },
            time: Date.now(),
        };
    }
    return { datetime: getFullDateAndTimeString(), ..._cache.value };
}
