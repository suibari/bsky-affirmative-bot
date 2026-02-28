import { MemoryService } from '@bsky-affirmative-bot/clients';
import { agent } from './agent.js';

/**
 * repostのオーバーライド
 * 開発環境ではなにもしない
 * @param {*} record 
 */
export async function repost(uri: string, cid: string): Promise<{
  uri: string,
  cid: string,
}> {
  if (process.env.NODE_ENV === "production") {
    const response = await agent.repost(uri, cid);
    return {
      uri: response.uri,
      cid: response.cid,
    };
  }

  // RateLimit加算
  MemoryService.incrementStats('bskyrate', 3).catch(e => console.error("Failed to increment bskyrate:", e));

  return {
    uri: "dev-stub-uri",
    cid: "dev-stub-cid",
  };
}
