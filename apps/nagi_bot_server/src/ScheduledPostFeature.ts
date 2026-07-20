import type { ScheduledPostRequest, ScheduledPostResult } from "@bsky-affirmative-bot/clients";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import retry from "async-retry";
import { agent } from "./agent.js";
import { buildLinkAttachments } from "./nagiLinkCards.js";
import { clipNagiPostText } from "./nagiPostText.js";

export async function publishScheduledPost(request: ScheduledPostRequest): Promise<ScheduledPostResult> {
  return retry(async () => {
    // facet のバイト位置がズレないよう、切り詰めた後の本文からリンクを検出する。
    const text = clipNagiPostText(request.text, "SCHEDULED_POST");
    const record: Record<string, unknown> = {
      $type: NAGI.post,
      text,
      createdAt: new Date().toISOString(),
      ...(request.langs?.length ? { langs: request.langs } : {}),
      ...(await buildLinkAttachments(text)),
    };

    if (request.kind === "good-night" && request.sourcePost?.network === "nagi") {
      record.embed = {
        $type: `${NAGI.post}#quote`,
        record: { uri: request.sourcePost.uri, cid: request.sourcePost.cid },
      };
    }

    const response = await agent.api.com.atproto.repo.createRecord({
      repo: process.env.NAGI_BOT_DID!,
      collection: NAGI.post,
      validate: false,
      record,
    } as any);

    return { uri: response.data.uri, cid: response.data.cid };
  }, {
    retries: 2,
    onRetry: (error, attempt) => {
      console.warn(`[WARN][SCHEDULED_POST] Nagi retry ${attempt}:`, error);
    },
  });
}
