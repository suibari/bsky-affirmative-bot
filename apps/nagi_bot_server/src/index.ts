import { startBotJetstream } from "@bsky-affirmative-bot/bot-runtime";
import { initializeDatabases } from "@bsky-affirmative-bot/clients";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import { initAgent } from "./agent.js";
import {
  assertNagiBotIdentity,
  syncNagiBotProfile,
} from "./NagiBotProfileFeature.js";
import { onNagiPost } from "./NagiReplyFeature.js";
import { startNagiReplyWorker } from "./NagiReplyWorker.js";
import express from "express";
import type { ScheduledPostRequest } from "@bsky-affirmative-bot/clients";
import { publishScheduledPost } from "./ScheduledPostFeature.js";

async function start() {
  await initializeDatabases();
  await initAgent();

  assertNagiBotIdentity();
  await syncNagiBotProfile().catch((error) => {
    console.error("[ERROR][NAGI] Failed to sync Bot profile:", error);
  });

  startBotJetstream({
    endpoint: process.env.URL_JETSTREAM,
    wantedCollections: [NAGI.post],
    onCreate: {
      [NAGI.post]: onNagiPost,
    },
  });
  startNagiReplyWorker();

  const app = express();
  app.use(express.json());
  app.post("/posts/scheduled", async (req, res) => {
    try {
      const request = req.body as ScheduledPostRequest;
      if (!(["morning", "whimsical", "good-night"] as const).includes(request?.kind) || typeof request.text !== "string" || !request.text.trim()) {
        res.status(400).json({ error: "kind and text are required" });
        return;
      }
      res.status(200).json(await publishScheduledPost(request));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
  const port = Number(process.env.NAGI_BOT_SERVER_PORT || 3003);
  // サービス間通信専用のエンドポイントのため、他ホストから到達できないよう
  // loopback にバインドする。
  app.listen(port, "127.0.0.1", () =>
    console.log(`[INFO][NAGI] HTTP server listening on 127.0.0.1:${port}.`),
  );

  console.log("[INFO][NAGI] Nagi Bot Server started.");
}

start().catch((error) => {
  console.error("[CRITICAL][NAGI] Bot startup failed:", error);
  process.exit(1);
});
