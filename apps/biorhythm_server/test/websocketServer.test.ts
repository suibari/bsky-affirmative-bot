import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { WebSocket } from "ws";
import {
  attachBiorhythmWebSocketServer,
  parseAllowedOrigins,
} from "../src/websocketServer.js";

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

const listen = (server: http.Server) => new Promise<number>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return reject(new Error("Missing listen address"));
    resolve(address.port);
  });
});

const stop = (server: http.Server) => new Promise<void>((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
});

const connect = (url: string, origin: string) => new Promise<WebSocket>((resolve, reject) => {
  const socket = new WebSocket(url, { origin });
  socket.once("open", () => resolve(socket));
  socket.once("error", reject);
});

const rejectedStatus = (url: string, origin: string) => new Promise<number>((resolve, reject) => {
  const socket = new WebSocket(url, { origin });
  socket.once("unexpected-response", (_request, response) => {
    resolve(response.statusCode ?? 0);
    socket.terminate();
  });
  socket.once("error", reject);
});

test("Origin許可リストは完全なOriginだけを受け付ける", () => {
  assert.deepEqual(
    [...parseAllowedOrigins("https://suibari.com, https://bot-tan.com")],
    ["https://suibari.com", "https://bot-tan.com"],
  );
  assert.throws(() => parseAllowedOrigins("https://bot-tan.com/path"), /Invalid WebSocket origin/);
});

test("許可OriginだけUpgradeし、IP別接続上限を適用する", async (t) => {
  const server = http.createServer();
  const websocket = attachBiorhythmWebSocketServer(server, {
    allowedOrigins: new Set(["https://suibari.com", "https://bot-tan.com"]),
    enforceAllowedOrigins: true,
    getSnapshot: async () => ({ energy: 50 }),
    maxConnections: 10,
    maxConnectionsPerIp: 1,
    maxBufferedBytes: 1024,
    heartbeatIntervalMs: 60_000,
    snapshotTtlMs: 5_000,
    trustCfConnectingIp: false,
    logger: silentLogger,
  });
  const port = await listen(server);
  const url = `ws://127.0.0.1:${port}/ws`;
  t.after(async () => {
    websocket.close();
    await stop(server);
  });

  assert.equal(await rejectedStatus(url, "https://example.com"), 403);
  const first = await connect(url, "https://bot-tan.com");
  assert.equal(await rejectedStatus(url, "https://suibari.com"), 429);
  first.close();
  await new Promise<void>((resolve) => first.once("close", () => resolve()));
});

test("同時接続の初期状態取得を一本化する", async (t) => {
  const server = http.createServer();
  let snapshotCalls = 0;
  const websocket = attachBiorhythmWebSocketServer(server, {
    allowedOrigins: new Set(["https://bot-tan.com"]),
    enforceAllowedOrigins: true,
    getSnapshot: async () => {
      snapshotCalls++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { status: "Sleep" };
    },
    maxConnections: 10,
    maxConnectionsPerIp: 10,
    maxBufferedBytes: 1024,
    heartbeatIntervalMs: 60_000,
    snapshotTtlMs: 5_000,
    trustCfConnectingIp: false,
    logger: silentLogger,
  });
  const port = await listen(server);
  const url = `ws://127.0.0.1:${port}/ws`;
  t.after(async () => {
    websocket.close();
    await stop(server);
  });

  const sockets = await Promise.all([
    connect(url, "https://bot-tan.com"),
    connect(url, "https://bot-tan.com"),
  ]);
  await Promise.all(sockets.map((socket) => new Promise<void>((resolve) => {
    socket.once("message", () => resolve());
  })));
  assert.equal(snapshotCalls, 1);
  for (const socket of sockets) socket.close();
});
