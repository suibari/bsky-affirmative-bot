import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { agent } from './agent.js';

/**
 * postのオーバーライド
 * 開発環境ではなにもしない
 * @param {*} record 
 */
export async function post(record: Record): Promise<{
  uri: string,
  cid: string,
}> {
  if (process.env.NODE_ENV === "production") {
    const response = await agent.post(record);
    return {
      uri: response.uri,
      cid: response.cid,
    };
  } else if (process.env.NODE_ENV === "development") {
    console.log(`[DEBUG] bot>>> ${record.text}`);
  }

  return {
    uri: "dev-stub-uri",
    cid: "dev-stub-cid",
  };
}
