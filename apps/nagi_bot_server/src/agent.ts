import { createBotAgent } from "@bsky-affirmative-bot/bot-runtime";
import type { AtpAgent } from "@atproto/api";

// 識別子はハンドルではなく DID。ハンドルは可変で、変更のたびにログインが黙って壊れるため。
// NAGI_BOT_DID は NagiBotProfileFeature / NagiReplyWorker で DID 形式を検証済み。
const runtime = createBotAgent({
  identifier: process.env.NAGI_BOT_DID,
  password: process.env.NAGI_BOT_APP_PASSWORD,
});

export const agent: AtpAgent = runtime.agent;
export const initAgent = runtime.login;
