import { createHash } from "node:crypto";
import { NAGI, type NagiNews } from "@bsky-affirmative-bot/nagi-lexicon";
import { agent } from "./agent.js";

export type PublishNewsRequest = Omit<NagiNews, "$type">;

export function newsRkey(articleId: string): string {
  return createHash("sha256").update(articleId).digest("hex").slice(0, 32);
}

export async function publishNews(request: PublishNewsRequest) {
  if (!agent.did) throw new Error("Nagi bot is not logged in");
  const record: NagiNews = { $type: NAGI.news, ...request };
  const response = await agent.com.atproto.repo.putRecord({
    repo: agent.did,
    collection: NAGI.news,
    rkey: newsRkey(request.articleId),
    record,
    validate: false,
  });
  return { uri: response.data.uri, cid: response.data.cid };
}
