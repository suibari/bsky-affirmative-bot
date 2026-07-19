import type { ScheduledPostRequest, ScheduledPostResult } from "@bsky-affirmative-bot/clients";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import retry from "async-retry";
import { agent } from "./agent.js";

function clipNagiPostText(text: string) {
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)];
  if (segments.length <= 3000 && Buffer.byteLength(text, "utf8") <= 30000) return text;

  let clipped = "";
  for (const { segment } of segments.slice(0, 3000)) {
    if (Buffer.byteLength(clipped + segment, "utf8") > 30000) break;
    clipped += segment;
  }
  console.warn(`[WARN][SCHEDULED_POST] Nagi text was clipped (${segments.length} graphemes).`);
  return clipped;
}

export async function publishScheduledPost(request: ScheduledPostRequest): Promise<ScheduledPostResult> {
  return retry(async () => {
    const record: Record<string, unknown> = {
      $type: NAGI.post,
      text: clipNagiPostText(request.text),
      createdAt: new Date().toISOString(),
      ...(request.langs?.length ? { langs: request.langs } : {}),
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
