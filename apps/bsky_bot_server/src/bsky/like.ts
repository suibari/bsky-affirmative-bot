import { logger } from '../logger.js';
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
  if (process.env.NODE_ENV === "production") {
    const response = await agent.like(uri, cid);
    return {
      uri: response.uri,
      cid: response.cid,
    };
  }

  // RateLimit加算
  logger.addBskyRate();

  return {
    uri: "dev-stub-uri",
    cid: "dev-stub-cid",
  };
}
