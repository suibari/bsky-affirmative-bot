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

  console.log("[INFO][NAGI] Nagi Bot Server started.");
}

start().catch((error) => {
  console.error("[CRITICAL][NAGI] Bot startup failed:", error);
  process.exit(1);
});
