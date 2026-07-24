import type { ScheduledPostRequest, ScheduledPostResult } from "@bsky-affirmative-bot/clients";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import retry from "async-retry";
import { publishNagiPost } from "./nagiPost.js";

export async function publishScheduledPost(request: ScheduledPostRequest): Promise<ScheduledPostResult> {
  return retry(async () => {
    const post = await publishNagiPost({
      text: request.text,
      label: "SCHEDULED_POST",
      ...(request.langs?.length ? { langs: request.langs } : {}),
      ...(request.kind === "good-night" && request.sourcePost?.network === "nagi"
        ? {
            embed: {
              $type: `${NAGI.post}#quote` as const,
              record: { uri: request.sourcePost.uri, cid: request.sourcePost.cid },
            },
          }
        : {}),
    });
    return post;
  }, {
    retries: 2,
    onRetry: (error, attempt) => {
      console.warn(`[WARN][SCHEDULED_POST] Nagi retry ${attempt}:`, error);
    },
  });
}
