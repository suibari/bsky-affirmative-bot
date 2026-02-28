import express from "express";
import dotenv from "dotenv";
import { agent, initAgent } from "./bsky/agent.js";
import { startWebSocket } from "./bsky/jetstream.js";
import { scheduleAllUserDiaries } from "./features/DiaryFeature.js";
import { updateFollowers } from "./bsky/followerManagement.js";
import { onPost, onFollow, onLike } from "./bsky/callbacks.js";
import { router } from "./routes.js";
import axios from "axios";

dotenv.config({ path: '../../.env' });

const app = express();
app.use(express.json());
app.use("/", router);

const PORT = process.env.BSKY_BOT_SERVER_PORT || 3001;

// Endpoints for features triggered by biorhythm_server
// Moved to routes.ts

app.listen(PORT, async () => {
  console.log(`Besky Bot Server running on port ${PORT}`);
  try {
    const { initializeDatabases } = await import("@bsky-affirmative-bot/clients");
    await initializeDatabases();

    await initAgent();
    await updateFollowers();

    // Run diary scheduling in the background
    scheduleAllUserDiaries().catch(e => {
      console.error("[ERROR] Failed to schedule diaries:", e);
    });

    startWebSocket(onPost, onFollow, onLike);
  } catch (e) {
    console.error("[CRITICAL] Bot startup failed:", e);
  }
});
