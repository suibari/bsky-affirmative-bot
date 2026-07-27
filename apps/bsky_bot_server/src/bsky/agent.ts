import { createBotAgent } from "@bsky-affirmative-bot/bot-runtime";

// 識別子はハンドルではなく DID を使う。ハンドルは可変（cf. bot-tan.suibari.com → bot-tan.com）で、
// 変更のたびにログインが黙って壊れるため。createSession は DID を identifier として受け付ける。
const runtime = createBotAgent({
  identifier: process.env.BSKY_DID,
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
