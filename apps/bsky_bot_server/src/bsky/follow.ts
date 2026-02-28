import { agent } from './agent.js';

/**
 * followのオーバーライド
 * 開発環境ではなにもしない
 */
export async function follow(subjectDid: string): Promise<{
  uri: string,
  cid: string,
}> {
  if (process.env.NODE_ENV === "production") {
    const response = await agent.follow(subjectDid);
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
