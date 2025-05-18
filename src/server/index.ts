import express from 'express';
import http from 'http';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { BiorhythmManager, botBiothythmManager } from "../biorhythm";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startServer(bot: BiorhythmManager) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  const broadcast = (data: any) => {
    const json = JSON.stringify(data);
    for (const client of wss.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(json);
      }
    }
  };

  bot.on('statsChange', () => {
    const state = botBiothythmManager.getCurrentState();
    broadcast(state); // ← WebSocket送信
  });

  wss.on('connection', (ws) => {
    console.log(`[INFO] Client connected`);
    const state = botBiothythmManager.getCurrentState();
    ws.send(JSON.stringify(state));
  });

  server.listen(process.env.NODE_PORT, () => {
    console.log(`🟢 listening server: http://localhost:${process.env.NODE_PORT}`);
  });

  // ---キャッシュ用---
  let latestState = {
    energy: bot.getEnergy.toFixed(1),
    status: bot.getMood || 'No Status',
  };
}

