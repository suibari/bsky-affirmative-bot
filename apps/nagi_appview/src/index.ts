import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { initializeDatabases } from "@bsky-affirmative-bot/database";
import { config } from "./config.js";
import { xrpc } from "./routes/xrpc.js";
import { wellKnownDid } from "./routes/wellKnownDid.js";
import { getBlob } from "./routes/blob.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { startJetstream } from "./ingest/jetstream.js";
const app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: config.clientOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type"],
  }),
);
app.use(express.json({ limit: "32kb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/.well-known/did.json", wellKnownDid);
app.use(
  "/xrpc",
  rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false }),
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
