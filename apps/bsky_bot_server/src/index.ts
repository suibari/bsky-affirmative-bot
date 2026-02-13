import express from "express";
import dotenv from "dotenv";
import { doGoodNightPost, doWhimsicalPost, doQuestionPost } from "./features/whimsical.js";
import { agent, initAgent } from "./bsky/agent.js";
import { startWebSocket } from "./bsky/jetstream.js";
import { features } from "./features/index.js";
// import { db } from "./db.js"; // Removed
import { updateFollowers } from "./bsky/followerManagement.js";
import { onPost, onFollow, onLike } from "./bsky/callbacks.js";
import { router } from "./routes.js";
import axios from "axios";

dotenv.config();

const app = express();
app.use(express.json());
app.use("/", router);

const PORT = process.env.BSKY_BOT_SERVER_PORT || 3001;
const BIORHYTHM_SERVER_URL = process.env.BIORHYTHM_SERVER_URL || "http://localhost:3002";

// Compatibility exports for features
import { logger } from "./logger.js";
export { logger };

/**
 * Biorhythm Server Client
 */
export const botBiothythmManager = {
  getMood: async () => {
    try {
      const res = await axios.get(`${BIORHYTHM_SERVER_URL}/status`);
      return res.data.mood || "Normal";
    } catch (e) {
      return "Normal";
    }
  },
  addAffirmation: async (did: string) => {
    await axios.post(`${BIORHYTHM_SERVER_URL}/energy`, { amount: 10, type: "affirmation", did });
  },
  addDJ: async () => {
    await axios.post(`${BIORHYTHM_SERVER_URL}/energy`, { amount: 20, type: "dj" });
  },
  addFortune: async () => {
    await axios.post(`${BIORHYTHM_SERVER_URL}/energy`, { amount: 15, type: "fortune" });
  },
  addCheer: async () => {
    await axios.post(`${BIORHYTHM_SERVER_URL}/energy`, { amount: 25, type: "cheer" });
  },
  addAnswer: async () => {
    await axios.post(`${BIORHYTHM_SERVER_URL}/energy`, { amount: 15, type: "answer" });
  },
  addConversation: async () => {
    await axios.post(`${BIORHYTHM_SERVER_URL}/energy`, { amount: 10, type: "conversation" });
  },
  addAnalysis: async () => {
    await axios.post(`${BIORHYTHM_SERVER_URL}/energy`, { amount: 50, type: "analysis" });
  },
  addAnniversary: async () => {
    await axios.post(`${BIORHYTHM_SERVER_URL}/energy`, { amount: 100, type: "anniversary" });
  },
  addLike: async () => {
    await axios.post(`${BIORHYTHM_SERVER_URL}/energy`, { amount: 5, type: "like" });
  },
  addFollower: async () => {
    await axios.post(`${BIORHYTHM_SERVER_URL}/energy`, { amount: 50, type: "follow" });
  }
};

// Endpoints for features triggered by biorhythm_server
// Moved to routes.ts

app.listen(PORT, async () => {
  console.log(`Besky Bot Server running on port ${PORT}`);
  try {
    const { initializeDatabases } = await import("@bsky-affirmative-bot/clients");
    await initializeDatabases();

    await initAgent();
    await updateFollowers();
    startWebSocket(onPost, onFollow, onLike); // startWebSocket is void or async? It was awaited before.
  } catch (e) {
    console.error("[CRITICAL] Bot startup failed:", e);
  }
});
