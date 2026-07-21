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
import {
  processNagiDiary,
  purgeNagiDiaries,
  scheduleAllNagiDiaries,
} from "./NagiDiaryFeature.js";

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

  scheduleAllNagiDiaries().catch((error) => {
    console.error("[ERROR][NAGI] Failed to schedule diaries:", error);
  });

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
  // 22時を待たずに日記を書かせる（動作確認・手動リカバリ用）。
  app.post("/diaries/run", async (req, res) => {
    try {
      const did = String(req.body?.did ?? "");
      if (!did.startsWith("did:")) {
        res.status(400).json({ error: "did is required" });
        return;
      }
      await processNagiDiary(did);
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  // データ削除時に bot リポジトリから当該ユーザーの日記を消す。
  app.post("/diaries/purge", async (req, res) => {
    try {
      const did = String(req.body?.did ?? "");
      if (!did.startsWith("did:")) {
        res.status(400).json({ error: "did is required" });
        return;
      }
      res.status(200).json({ deleted: await purgeNagiDiaries(did) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
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
