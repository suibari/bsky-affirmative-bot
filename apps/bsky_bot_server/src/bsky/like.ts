import { MemoryService } from '@bsky-affirmative-bot/clients';
import { agent } from './agent.js';

/**
 * likeのオーバーライド
 * 開発環境ではなにもしない
 * @param {*} uri 
 * @param {*} cid 
 */
export async function like(uri: string, cid: string): Promise<{
  uri: string,
  cid: string,
}> {
  // RateLimit加算
  MemoryService.incrementStats('bskyrate', 3).catch(e => console.error("Failed to increment bskyrate:", e));

  if (process.env.NODE_ENV === "production") {
    const response = await agent.like(uri, cid);
    return {
      uri: response.uri,
      cid: response.cid,
    };
  }

  return {
    uri: "dev-stub-uri",
    cid: "dev-stub-cid",
  };
}
