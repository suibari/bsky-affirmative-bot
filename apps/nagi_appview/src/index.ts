import express from "express";
import cors from "cors";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { initializeDatabases } from "@bsky-affirmative-bot/database";
import { config } from "./config.js";
import { xrpc } from "./routes/xrpc.js";
import { internal } from "./routes/internal.js";
import { wellKnownDid } from "./routes/wellKnownDid.js";
import { getBlob } from "./routes/blob.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { startJetstream } from "./ingest/jetstream.js";
import { startEmbeddingWorker } from "./ingest/embeddingWorker.js";
import { startActorResolveWorker } from "./ingest/actorResolveWorker.js";
import {
  startReconcileWorker,
  stopReconcileWorker,
} from "./ingest/reconcileWorker.js";
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
    // x-viewer-did は開発直fetch用のカスタムヘッダー。許可名を足すだけで無害
    // （実際に信用するのは APPVIEW_DEV_TRUST_VIEWER=true のときだけ）。
    allowedHeaders: ["authorization", "content-type", "x-viewer-did"],
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
// NL検索(意味検索)用の投稿本文埋め込みを非同期生成（既存投稿のバックフィルも兼ねる）。
// OLLAMA_BASE_URL 未設定なら実質 no-op。
startEmbeddingWorker();
// did→handle/pds を解決して nagiActors をインデックス（searchActors とハンドル表示に必要）。
startActorResolveWorker();
startReconcileWorker();
// 本番機がうっかり NODE_ENV=development で起動していたら、ここで気づけるようにする。
// 開発補助は config.dev に集約してあるので、この1行が「何が開いているか」の一覧になる。
if (config.dev) {
  console.warn(
    `[dev] development mode is ON (trustViewerHeader=${config.devTrustViewer}). Never run production like this.`,
  );
}
const onListen = () =>
  console.log(`Nagi AppView listening on ${config.host ?? "(default)"}:${config.port}`);
const server = config.host
  ? app.listen(config.port, config.host, onListen)
  : app.listen(config.port, onListen);

// サービス間通信(/internal)は公開アプリとは別のリスナーに載せ、127.0.0.1 だけに束縛する。
// 認可はこの束縛そのもの。公開 app 側に mount すると誰でも叩けるようになるので分ける。
const internalApp = express();
internalApp.use(express.json({ limit: "32kb" }));
internalApp.use("/internal", internal);
internalApp.use(notFound);
internalApp.use(errorHandler);
const internalServer = internalApp.listen(config.internalPort, "127.0.0.1", () =>
  console.log(`Nagi AppView internal API listening on 127.0.0.1:${config.internalPort}`),
);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  const serverClosed = new Promise<void>((resolve) => server.close(() => resolve()));
  const internalClosed = new Promise<void>((resolve) =>
    internalServer.close(() => resolve()),
  );
  await Promise.allSettled([
    serverClosed,
    internalClosed,
    stream.close(),
    stopReconcileWorker(),
  ]);
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
