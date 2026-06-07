import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import { BiorhythmManager } from "./manager.js";

dotenv.config({ path: '../../.env' });

const app = express();
app.use(express.json());

const PORT = process.env.BIORHYTHM_SERVER_PORT || 3002;

const manager = new BiorhythmManager();

// Endpoints
app.get("/status", async (req, res) => {
  const state = await manager.getCurrentState();
  res.json(state);
});

app.post("/energy", async (req, res) => {
  const { amount, type, did } = req.body;

  try {
    if (type === "affirmation" && did) {
      manager.addAffirmation(did);
    } else if (type === "dj") {
      await manager.addDJ();
    } else if (type === "fortune") {
      await manager.addFortune();
    } else if (type === "cheer") {
      await manager.addCheer();
    } else if (type === "answer") {
      await manager.addAnswer();
    } else if (type === "conversation") {
      await manager.addConversation();
    } else if (type === "analysis") {
      await manager.addAnalysis();
    } else if (type === "anniversary") {
      await manager.addAnniversary();
    } else if (type === "like") {
      await manager.addLike();
    } else if (amount) {
      // Generic energy change
      await (manager as any).changeEnergy(amount);
    }
  } catch (err: any) {
    console.error("[ERROR][ENERGY] Failed to process energy update:", err.message);
  }

  res.json({ success: true, energy: manager.getEnergy });
});

// User requested static endpoints
app.get("/.well-known/atproto-did", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(process.env.BSKY_DID);
});

app.get("/image.png", (req, res) => {
  const imageBuffer = manager.generatedImage;
  if (imageBuffer) {
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    res.end(imageBuffer);
  } else {
    res.status(404).send("Image not found");
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// WebSocket broadcasting
const broadcast = (data: any) => {
  const json = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) { // OPEN
      client.send(json);
    }
  }
};

manager.on('statsChange', (state) => {
  broadcast(state);
});

wss.on('connection', async (ws, req) => {
  const origin = req.headers.origin;
  if (process.env.NODE_ENV === "production" && origin !== 'https://suibari.com') {
    console.log(`[WARN] Blocked WS connection from origin: ${origin}`);
    ws.close();
    return;
  }

  console.log(`[INFO] WS client connected from origin: ${origin}`);
  const state = await manager.getCurrentState();
  ws.send(JSON.stringify(state));
});

server.listen(PORT, async () => {
  console.log(`Biorhythm Server running on port ${PORT}`);
  console.log(`🟢 WS server listening on path /ws`);
  try {
    const { initializeDatabases } = await import("@bsky-affirmative-bot/clients");
    await initializeDatabases();

    await manager.init();
    const { scheduleRoomInteractionSync } = await import("./roomInteractionSync.js");
    scheduleRoomInteractionSync(manager);
    await manager.step();
    console.log("[INFO] Biorhythm loop started.");
  } catch (e) {
    console.error("[CRITICAL] Biorhythm startup failed:", e);
  }
});
