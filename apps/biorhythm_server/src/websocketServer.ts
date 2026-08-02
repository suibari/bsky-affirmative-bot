import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";

type Logger = Pick<Console, "info" | "warn" | "error">;

export interface BiorhythmWebSocketOptions {
  allowedOrigins: ReadonlySet<string>;
  enforceAllowedOrigins: boolean;
  getSnapshot: () => Promise<unknown>;
  maxConnections: number;
  maxConnectionsPerIp: number;
  maxBufferedBytes: number;
  heartbeatIntervalMs: number;
  snapshotTtlMs: number;
  trustCfConnectingIp: boolean;
  logger?: Logger;
}

interface TrackedWebSocket extends WebSocket {
  isAlive: boolean;
}

const rejectUpgrade = (socket: Duplex, statusCode: number, reason: string) => {
  if (!socket.destroyed) {
    socket.end(
      `HTTP/1.1 ${statusCode} ${reason}\r\n` +
      "Connection: close\r\n" +
      "Content-Length: 0\r\n\r\n",
    );
  }
};

const requestPath = (req: IncomingMessage) => {
  try {
    return new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    return "";
  }
};

const clientIp = (req: IncomingMessage, trustCfConnectingIp: boolean) => {
  if (trustCfConnectingIp) {
    const value = req.headers["cf-connecting-ip"];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
};

export const parseAllowedOrigins = (value: string | undefined) => {
  const origins = new Set<string>();
  for (const raw of value?.split(",") ?? []) {
    const candidate = raw.trim();
    if (!candidate) continue;
    const parsed = new URL(candidate);
    if (!(["http:", "https:"] as string[]).includes(parsed.protocol) || parsed.origin !== candidate) {
      throw new Error(`Invalid WebSocket origin: ${candidate}`);
    }
    origins.add(candidate);
  }
  return origins;
};

export const readPositiveInteger = (
  value: string | undefined,
  fallback: number,
  name: string,
) => {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

export const attachBiorhythmWebSocketServer = (
  server: HttpServer,
  options: BiorhythmWebSocketOptions,
) => {
  const logger = options.logger ?? console;
  const wss = new WebSocketServer({ noServer: true });
  const connectionsByIp = new Map<string, number>();
  let snapshotJson: string | undefined;
  let snapshotUpdatedAt = 0;
  let snapshotRequest: Promise<string> | undefined;

  const snapshot = async () => {
    if (snapshotJson !== undefined && Date.now() - snapshotUpdatedAt < options.snapshotTtlMs) {
      return snapshotJson;
    }
    if (!snapshotRequest) {
      snapshotRequest = options.getSnapshot()
        .then((state) => {
          snapshotJson = JSON.stringify(state);
          snapshotUpdatedAt = Date.now();
          return snapshotJson;
        })
        .finally(() => {
          snapshotRequest = undefined;
        });
    }
    return snapshotRequest;
  };

  const broadcast = (state: unknown) => {
    snapshotJson = JSON.stringify(state);
    snapshotUpdatedAt = Date.now();
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (client.bufferedAmount > options.maxBufferedBytes) {
        logger.warn(`[WARN][BIO][WS] Slow client terminated (buffered=${client.bufferedAmount})`);
        client.terminate();
        continue;
      }
      client.send(snapshotJson);
    }
  };

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (requestPath(req) !== "/ws") {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    const origin = req.headers.origin;
    if (options.enforceAllowedOrigins && (!origin || !options.allowedOrigins.has(origin))) {
      logger.warn(`[WARN][BIO][WS] Blocked origin: ${origin ?? "(missing)"}`);
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }

    if (wss.clients.size >= options.maxConnections) {
      logger.warn("[WARN][BIO][WS] Global connection limit reached");
      rejectUpgrade(socket, 503, "Service Unavailable");
      return;
    }

    const ip = clientIp(req, options.trustCfConnectingIp);
    if ((connectionsByIp.get(ip) ?? 0) >= options.maxConnectionsPerIp) {
      logger.warn(`[WARN][BIO][WS] Per-IP connection limit reached: ${ip}`);
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, ip);
    });
  };

  server.on("upgrade", onUpgrade);

  wss.on("connection", async (socket: TrackedWebSocket, req: IncomingMessage, ip: string) => {
    connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });
    socket.once("close", () => {
      const remaining = (connectionsByIp.get(ip) ?? 1) - 1;
      if (remaining > 0) connectionsByIp.set(ip, remaining);
      else connectionsByIp.delete(ip);
    });

    logger.info(`[INFO][BIO][WS] Client connected from ${ip}, origin: ${req.headers.origin}`);
    try {
      const initialSnapshot = await snapshot();
      if (socket.readyState === WebSocket.OPEN) socket.send(initialSnapshot);
    } catch (error) {
      logger.error("[ERROR][BIO][WS] Failed to load initial snapshot:", error);
      socket.close(1011, "Snapshot unavailable");
    }
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients as Set<TrackedWebSocket>) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, options.heartbeatIntervalMs);
  heartbeat.unref();

  const close = () => {
    clearInterval(heartbeat);
    server.off("upgrade", onUpgrade);
    for (const socket of wss.clients) socket.terminate();
    wss.close();
  };

  return { broadcast, close, wss };
};
