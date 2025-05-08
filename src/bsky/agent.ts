// src/bsky/agent.ts
import { AtpAgent } from "@atproto/api";

const agent = new AtpAgent({ service: "https://bsky.social" });

const identifier = process.env.BSKY_IDENTIFIER!;
const password = process.env.BSKY_APP_PASSWORD!;
let accessJwt: string | null = null;
let refreshJwt: string | null = null;

/**
 * ログインしてトークンを取得する
 */
export async function initAgent() {
  const response = await agent.login({ identifier, password });
  accessJwt = response.data.accessJwt;
  refreshJwt = response.data.refreshJwt;
  console.log("[INFO] created new session.");
}

/**
 * トークンの期限チェックと更新
 */
export async function checkWithRefreshSession() {
  try {
    await agent.getTimeline();  // 成功すればそのまま
  } catch (err: any) {
    // 失敗した場合（トークン切れなど）
    if (
      err?.response?.data?.error === "ExpiredToken" || 
      err?.message?.includes("ExpiredToken")
    ) {
      const refresh = await agent.com.atproto.server.refreshSession();
      accessJwt = refresh.data.accessJwt;
      refreshJwt = refresh.data.refreshJwt;
      console.log("[INFO] token was expired, so refreshed the session.");
    } else {
      console.error("[ERROR] unexpected error:", err);
      throw err;
    }
  }
}

/**
 * 他のモジュールから使える共通エージェント
 */
export { agent };
