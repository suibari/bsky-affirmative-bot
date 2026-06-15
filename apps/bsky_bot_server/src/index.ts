import express from "express";
import dotenv from "dotenv";
import { agent, initAgent } from "./bsky/agent.js";
import { startWebSocket } from "./bsky/jetstream.js";
import { scheduleAllUserDiaries } from "./features/DiaryFeature.js";
import { scheduleSubscriberLabelSync } from "./features/SubscriberLabelFeature.js";
import { scheduleRegularBadgeSync } from "./features/RoomVisitBadgeFeature.js";
import { updateFollowers, loadFollowersFromCache } from "./bsky/followerManagement.js";
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
    
    // 起動時にまずファイルキャッシュからフォロワー情報を復元（一瞬で完了）
    await loadFollowersFromCache();
    
    // フォロワー取得は時間がかかるため非同期で実行し、ブロックしない
    updateFollowers().catch(e => {
      console.error("[ERROR] Failed to update followers on startup:", e);
    });

    // takedown復活などでキャッシュから漏れたフォロワーを定期的に回復する
    setInterval(() => {
      updateFollowers().catch(e => console.error("[ERROR] Periodic follower update failed:", e));
    }, 60 * 60 * 1000); // 1時間

    // Run diary scheduling in the background
    scheduleAllUserDiaries().catch(e => {
      console.error("[ERROR] Failed to schedule diaries:", e);
    });

    // Run subscriber label synchronization in the background
    scheduleSubscriberLabelSync().catch(e => {
      console.error("[ERROR] Failed to schedule subscriber labels:", e);
    });

    // Run regular badge synchronization in the background
    scheduleRegularBadgeSync().catch(e => {
      console.error("[ERROR] Failed to schedule regular badges:", e);
    });

    startWebSocket(onPost, onFollow, onLike);
  } catch (e) {
    console.error("[CRITICAL] Bot startup failed:", e);
  }
});
