import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { agent } from './agent.js';
import { RichText } from "@atproto/api";

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
    // リッチテキスト解釈
    const rt = new RichText({text: record.text});
    await rt.detectFacets(agent);
    record.text = rt.text;
    record.facets = rt.facets;

    const response = await agent.post(record);
    return {
      uri: response.uri,
      cid: response.cid,
    };
  }

  console.log(`[DEBUG] bot>>> ${record.text}`);
  return {
    uri: "dev-stub-uri",
    cid: "dev-stub-cid",
  };
}
