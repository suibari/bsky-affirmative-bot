import { createBotAgent } from "@bsky-affirmative-bot/bot-runtime";
import type { AtpAgent } from "@atproto/api";

const runtime = createBotAgent({
  identifier: process.env.NAGI_BOT_IDENTIFIER,
  password: process.env.NAGI_BOT_APP_PASSWORD,
});

export const agent: AtpAgent = runtime.agent;
export const initAgent = runtime.login;
