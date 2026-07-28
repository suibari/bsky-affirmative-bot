const required = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const integer = (name: string, fallback: number, minimum: number, maximum: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
};

const url = (name: string, fallback?: string) => {
  const value = required(name, fallback);
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }
  return parsed.toString().replace(/\/$/, "");
};

const did = (name: string, fallback?: string) => {
  const value = required(name, fallback);
  if (!/^did:(plc|web):/.test(value)) {
    throw new Error(`${name} must be an AT Protocol DID`);
  }
  return value;
};

const clientOrigins = (name: string, fallback: string) => {
  const configured = url(name, fallback);
  const parsed = new URL(configured);
  const origins = new Set([parsed.origin]);

  if (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    const port = parsed.port ? `:${parsed.port}` : "";
    origins.add(`${parsed.protocol}//localhost${port}`);
    origins.add(`${parsed.protocol}//127.0.0.1${port}`);
    origins.add(`${parsed.protocol}//[::1]${port}`);
  }

  return [...origins];
};

/**
 * 開発環境かどうか。DEV 系のフラグを増やさないための単一の判定。
 *
 * 未設定・未知の値はすべて「開発ではない」に倒す。旧 Bluesky bot スタックには
 * `=== "production"` と `!== "development"` が混在していて、未設定時にどちらへ倒れるかが
 * 場所によって違う。ここは必ず「明示的に development のときだけ true」で統一する。
 */
const isDev = process.env.NODE_ENV === "development";

export const config = {
  port: integer("NAGI_PORT", 3002, 1, 65_535),
  // 待ち受けホスト。未設定なら Node 既定（unspecified）。WSL2 等で localhost が ::1(IPv6) に
  // 解決され 127.0.0.1(IPv4) が拒否されるときは NAGI_HOST=127.0.0.1 等で明示する（dev 用）。
  host: process.env.NAGI_HOST,
  databaseUrl: required("DATABASE_URL", "postgres://postgres@localhost:5432/postgres"),
  jetstreamUrl: required("URL_JETSTREAM", "wss://jetstream2.us-east.bsky.network/subscribe"),
  jetstreamReplaySeconds: integer(
    "NAGI_JETSTREAM_REPLAY_SECONDS",
    60,
    0,
    3_600,
  ),
  reconcileIntervalMinutes: integer(
    "NAGI_RECONCILE_INTERVAL_MINUTES",
    360,
    15,
    10_080,
  ),
  reconcileConcurrency: integer("NAGI_RECONCILE_CONCURRENCY", 2, 1, 8),
  appviewDid: did("NAGI_APPVIEW_DID", "did:web:nagi-api.suibari.com"),
  appviewServiceId: "nagi_appview",
  botDid: did("NAGI_BOT_DID"),
  // 開発補助をまとめて有効にする唯一のスイッチ。フラグを増やさないため、
  // 個別の DEV 系環境変数はできるだけこれに寄せる。
  dev: isDev,
  // 開発専用: local appview へ直接当てる際、service-auth JWT の代わりに
  // x-viewer-did ヘッダーを viewerDid として信用する。
  //
  // これは JWT 検証を丸ごと迂回する「読み取り側の認証バイパス」で、他の開発フラグとは
  // 危険度が違う。NODE_ENV=development との AND にしてあるので、本番の .env に
  // APPVIEW_DEV_TRUST_VIEWER=true が紛れ込んでも単独では有効にならない。
  devTrustViewer: isDev && process.env.APPVIEW_DEV_TRUST_VIEWER === "true",
  // 内部エンドポイント(/internal)専用のループバックポート。nagi_bot_server と同じく
  // 127.0.0.1 に束縛して OS にアクセス制御させるので、共有シークレットは持たない。
  internalPort: integer("NAGI_APPVIEW_INTERNAL_PORT", 3004, 1, 65_535),
  clientOrigins: clientOrigins("NAGI_CLIENT_ORIGIN", "http://localhost:5173"),
  affirmationThreshold: integer(
    "NAGI_AFFIRMATION_THRESHOLD",
    Number(process.env.NAGI_TREND_THRESHOLD ?? 86),
    0,
    100,
  ),
  ollamaUrl: url("OLLAMA_BASE_URL", "http://localhost:11434"),
  translationModel: process.env.OLLAMA_TRANSLATION_MODEL ?? "translategemma:4b",
  translationConcurrency: integer("TRANSLATION_CONCURRENCY", 2, 1, 8),
  translationMissLimitPerMinute: integer(
    "TRANSLATION_MISS_LIMIT_PER_MINUTE",
    60,
    1,
    1_000,
  ),
  // Web Push（VAPID）。未設定ならプッシュ配信は無効化し、通知の挿入だけ従来どおり続ける。
  vapid:
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
      ? {
          publicKey: process.env.VAPID_PUBLIC_KEY,
          privateKey: process.env.VAPID_PRIVATE_KEY,
          subject: process.env.VAPID_SUBJECT ?? "mailto:admin@nagi.suibari.com",
        }
      : undefined,
};

export const appviewAudience = `${config.appviewDid}#${config.appviewServiceId}`;
