import express from "express";
import cors from "cors";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { initializeDatabases } from "@bsky-affirmative-bot/database";
import { config } from "./config.js";
import { xrpc } from "./routes/xrpc.js";
import { wellKnownDid } from "./routes/wellKnownDid.js";
import { getBlob } from "./routes/blob.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { startJetstream } from "./ingest/jetstream.js";
const app = express();
app.set("trust proxy", 1);
// atproto-proxy 経由の authed リクエストは送信元 IP がユーザの PDS になり、IP キーだと
// 同一 PDS 配下の全ユーザが 1 バケットを共有してしまう。Bearer（PDS 発行の service auth
// JWT）の iss（=ユーザ DID）をキーにし、Bearer 無しの公開直 fetch は IP キーへフォールバック。
// rate-limit のバケット用途なので iss は未検証デコードで十分。
const issFromBearer = (authorization: string | undefined): string | undefined => {
  const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
  const payload = token?.split(".")[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims.iss === "string" ? claims.iss : undefined;
  } catch {
    return undefined;
  }
};
app.use(
  cors({
    origin: config.clientOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type"],
  }),
);
app.use(express.json({ limit: "32kb" }));
app.get("/health", (_req, res) =>
  res.json({ ok: true, pushConfigured: Boolean(config.vapid) }),
);
app.get("/.well-known/did.json", wellKnownDid);
app.use(
  "/xrpc",
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => {
      const r = req as unknown as { header(name: string): string | undefined; ip?: string };
      return issFromBearer(r.header("authorization")) ?? ipKeyGenerator(r.ip ?? "");
    },
  }),
  xrpc,
);
app.get(
  "/api/blob/:did/:cid",
  rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }),
  getBlob,
);
app.use(notFound);
app.use(errorHandler);
await initializeDatabases();
const stream = await startJetstream();
const onListen = () =>
  console.log(`Nagi AppView listening on ${config.host ?? "(default)"}:${config.port}`);
const server = config.host
  ? app.listen(config.port, config.host, onListen)
  : app.listen(config.port, onListen);
const shutdown = () => {
  stream.close();
  server.close(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
