import http from 'http';
import { WebSocketServer } from 'ws';
import { BiorhythmManager, botBiothythmManager } from "../biorhythm";

export function startServer(bot: BiorhythmManager) {
  const server = http.createServer((_req, res) => {
    // HTTPリクエストは何も返さず切断
    res.writeHead(204); // No Content
    res.end();
  });

  const wss = new WebSocketServer({ server });

  // Biorhythm更新時に全クライアントに送信
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
    broadcast(state);
  });

  // WebSocket接続
  wss.on('connection', (ws, req) => {
    const origin = req.headers.origin;
    if (origin !== 'https://suibari.com') {
      console.log(`[WARN] Blocked WS connection from origin: ${origin}`);
      ws.close();
      return;
    }

    console.log(`[INFO] WS client connected from origin: ${origin}`);
    const state = botBiothythmManager.getCurrentState();
    ws.send(JSON.stringify(state));

    // 受信処理不要のため on('message') はなし
  });

  server.listen(process.env.NODE_PORT, () => {
    console.log(`🟢 WS server listening on port ${process.env.NODE_PORT}`);
  });
}
