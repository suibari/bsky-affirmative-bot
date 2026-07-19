import { getYokohamaWeather } from "@bsky-affirmative-bot/bot-brain";
import { botBiothythmManager } from "@bsky-affirmative-bot/clients";
import {
  configureBotContext,
  getBotContext,
} from "@bsky-affirmative-bot/bot-runtime";

configureBotContext({
  getWeather: getYokohamaWeather,
  getStatus: () => botBiothythmManager.getContext(),
});

export { getBotContext };
