import express from 'express';
import http from 'http';
import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { BiorhythmManager } from "../biorhythm";
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

  bot.on('energyChange', (value) => {
    broadcastUpdate({ energy: value.toFixed(1) });
  });

  bot.on('statusChange', (value) => {
    broadcastUpdate({ status: value });
  });

  wss.on('connection', (ws) => {
    console.log(`[INFO] Client connected`);
    ws.send(JSON.stringify({
      energy: bot.getEnergy.toFixed(1),
      status: bot.getOutput || 'No Status',
    }));
  });

  server.listen(process.env.NODE_PORT, () => {
    console.log(`🟢 listening server: http://localhost:${process.env.NODE_PORT}`);
  });

  // ---キャッシュ用---
  let latestState = {
    energy: bot.getEnergy.toFixed(1),
    status: bot.getOutput || 'No Status',
  };

  function broadcastUpdate(update: Partial<typeof latestState>) {
    latestState = { ...latestState, ...update };
    const message = JSON.stringify(latestState);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

