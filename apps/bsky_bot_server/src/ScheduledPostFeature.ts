import type { ScheduledPostRequest, ScheduledPostResult } from "@bsky-affirmative-bot/clients";
import { LeafletDiaryService, MemoryService } from "@bsky-affirmative-bot/clients";
import retry from "async-retry";
import { agent } from "./bsky/agent.js";
import { postContinuous } from "./bsky/postContinuous.js";
import { repost } from "./bsky/repost.js";

async function publishLeafletDiaries() {
  if (!process.env.LEAFLET_USERNAME) {
    console.log("[INFO][DIARY] LEAFLET_USERNAME is not set. Skipping diary posting.");
    return;
  }

  let diaryCount = 1;
  try {
    diaryCount = (await MemoryService.getBotState("diary_count") || 0) + 1;
    await MemoryService.setBotState("diary_count", diaryCount);
  } catch (error) {
    console.error("[ERROR][DIARY] Failed to manage diary_count:", error);
  }

  for (const language of ["ja", "en"] as const) {
    try {
      await LeafletDiaryService.generateAndPostDiary(agent, diaryCount, language);
    } catch (error) {
      console.error(`[ERROR][DIARY] Failed to publish ${language} diary:`, error);
    }
  }
}

export async function publishScheduledPost(request: ScheduledPostRequest): Promise<ScheduledPostResult> {
  if (request.kind === "good-night") {
    if (request.sourcePost?.network === "bsky") {
      try {
        await repost(request.sourcePost.uri, request.sourcePost.cid);
      } catch (error) {
        console.error("[ERROR][GOOD_NIGHT] Failed to repost top post:", error);
      }
    }
    await publishLeafletDiaries();
  }

  return retry(
    () => postContinuous(request.text),
    {
      retries: 2,
      onRetry: (error, attempt) => {
        console.warn(`[WARN][SCHEDULED_POST] Bluesky retry ${attempt}:`, error);
      },
    },
  );
}
