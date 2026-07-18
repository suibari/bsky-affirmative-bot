import { createBotAgent } from "@bsky-affirmative-bot/bot-runtime";

const runtime = createBotAgent({
  identifier: process.env.BSKY_IDENTIFIER,
  password: process.env.BSKY_APP_PASSWORD,
});

const { agent } = runtime;

/**
 * ログインしてトークンを取得する
 */
export async function initAgent() {
  await runtime.login();
}

/**
 * トークンの期限チェックと更新
 */
export async function createOrRefreshSession() {
  await runtime.createOrRefreshSession();
}

export { agent };
