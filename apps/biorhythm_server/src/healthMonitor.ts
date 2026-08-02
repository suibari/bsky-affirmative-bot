import {
  classifyHeartbeat,
  DEFAULT_DOWN_MS,
  DEFAULT_FRESH_MS,
  readHeartbeats,
  worstState,
  type HealthService,
  type HealthState,
  type HeartbeatRecord,
} from "@bsky-affirmative-bot/database";

/**
 * bot-tan.com のダッシュボードに出す死活監視。
 *
 * 各プロセスが書いたハートビート（bot_state の health:*）を読み、ここでしか
 * 分からないもの（ローカル LLM への疎通）はこのプロセスが自分でプローブする。
 */

/** UI 上のタイル。中身は複数のプローブの集約。 */
export type HealthTile = "jetstream" | "botServer" | "localLlm" | "gemini";

export interface HealthPart {
  name: string;
  state: HealthState;
  /** 最後に「生きている」と分かった時刻。 */
  lastOkAt?: string;
  lastError?: string;
}

export interface HealthTileStatus {
  state: HealthState;
  parts: HealthPart[];
}

export type HealthSnapshot = Record<HealthTile, HealthTileStatus> & {
  checkedAt: string;
};

const PROBE_INTERVAL_MS = 30_000;
const PROBE_TIMEOUT_MS = 3_000;

/**
 * Jetstream は「イベントが流れていること」ではなく接続が維持されていることを
 * 30秒ごとに報告するので、既定より少し緩めでよい。
 */
const JETSTREAM_FRESH_MS = 120_000;
const JETSTREAM_DOWN_MS = 300_000;

/**
 * Gemini は呼ばれたときにしか記録されない。botたんが寝ている間は何時間も
 * 呼び出しがないので、鮮度で down にすると毎晩赤くなってしまう。
 * ここでは「直近の記録が失敗かどうか」だけを見たいので、大きく取る。
 */
const GEMINI_FRESH_MS = 6 * 60 * 60 * 1000;
const GEMINI_DOWN_MS = 24 * 60 * 60 * 1000;

interface ProbeResult {
  state: HealthState;
  lastOkAt?: string;
  lastError?: string;
}

let localLlmProbe: ProbeResult = { state: "unknown" };

/**
 * ローカル LLM（Ollama の OpenAI 互換エンドポイント）への疎通確認。
 * `OLLAMA_BASE_URL` は `.../v1` まで含む前提（predefinedAffirmation.ts と同じ）。
 */
async function probeLocalLlm(): Promise<ProbeResult> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  if (!baseUrl) return { state: "unconfigured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // 内部ネットワークの固定アドレスなので safeFetch（SSRF 対策）は通さない。
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return { state: "down", lastError: `HTTP ${response.status}` };
    }
    return { state: "ok", lastOkAt: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { state: "down", lastError: message.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

/** ハートビート1件を、UI に渡す形へ整える。 */
function partFromHeartbeat(
  name: string,
  record: HeartbeatRecord | undefined,
  freshMs = DEFAULT_FRESH_MS,
  downMs = DEFAULT_DOWN_MS,
): HealthPart {
  const state = classifyHeartbeat(record, { freshMs, downMs });
  return {
    name,
    state,
    ...(record?.lastOkAt ? { lastOkAt: record.lastOkAt } : {}),
    // 直近が成功なら、過去のエラー文言は出さない（古い障害が残り続けて見える）。
    ...(state !== "ok" && record?.lastError ? { lastError: record.lastError } : {}),
  };
}

function partFromProbe(name: string, probe: ProbeResult): HealthPart {
  return {
    name,
    state: probe.state,
    ...(probe.lastOkAt ? { lastOkAt: probe.lastOkAt } : {}),
    ...(probe.lastError ? { lastError: probe.lastError } : {}),
  };
}

const tile = (parts: HealthPart[]): HealthTileStatus => ({
  state: worstState(parts.map((part) => part.state)),
  parts,
});

/** プロセスと、そのプロセスが所有するJetstream接続の悪いほうをサービス状態にする。 */
export function servicePart(
  name: string,
  process: HeartbeatRecord | undefined,
  jetstream: HeartbeatRecord | undefined,
): HealthPart {
  const processPart = partFromHeartbeat(name, process);
  const streamPart = partFromHeartbeat(
    name,
    jetstream,
    JETSTREAM_FRESH_MS,
    JETSTREAM_DOWN_MS,
  );
  const state = worstState([processPart.state, streamPart.state]);
  const okTimes = [processPart.lastOkAt, streamPart.lastOkAt]
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    name,
    state,
    // 両方が揃っている場合は古いほう＝弱い側の最終成功を示す。
    ...(okTimes[0] ? { lastOkAt: okTimes[0] } : {}),
    ...(state !== "ok" && (streamPart.lastError || processPart.lastError)
      ? { lastError: streamPart.lastError ?? processPart.lastError }
      : {}),
  };
}

/**
 * 3コンシューマーのどれかが接続中なら上流は到達可能。
 * 一部だけ切れている問題はbotServer側の該当サービスへ出し、ここでは外部依存だけを表す。
 */
export function upstreamPart(parts: HealthPart[]): HealthPart {
  const states = parts.map((part) => part.state);
  const state: HealthState = states.includes("ok")
    ? "ok"
    : states.every((value) => value === "down")
      ? "down"
      : states.some((value) => value === "down" || value === "stale")
        ? "stale"
        : "unknown";
  const lastOkAt = parts
    .map((part) => part.lastOkAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return {
    name: "Upstream WebSocket",
    state,
    ...(lastOkAt ? { lastOkAt } : {}),
    ...(state === "down"
      ? { lastError: parts.map((part) => part.lastError).find(Boolean) }
      : {}),
  };
}

let cached: HealthSnapshot | null = null;

/** 直近のプローブ結果とハートビートから、4タイル分の状態を組み立てる。 */
export async function buildHealthSnapshot(): Promise<HealthSnapshot> {
  const heartbeats = await readHeartbeats();
  const get = (service: HealthService) => heartbeats.get(service);
  const bskyStream = partFromHeartbeat(
    "Bluesky botたん",
    get("jetstream-bsky"),
    JETSTREAM_FRESH_MS,
    JETSTREAM_DOWN_MS,
  );
  const nagiStream = partFromHeartbeat(
    "Nagi botたん",
    get("jetstream-nagi"),
    JETSTREAM_FRESH_MS,
    JETSTREAM_DOWN_MS,
  );
  const appviewStream = partFromHeartbeat(
    "Nagi AppView",
    get("jetstream-appview"),
    JETSTREAM_FRESH_MS,
    JETSTREAM_DOWN_MS,
  );

  const snapshot: HealthSnapshot = {
    checkedAt: new Date().toISOString(),
    jetstream: tile([upstreamPart([bskyStream, nagiStream, appviewStream])]),
    botServer: tile([
      servicePart("Bluesky botたん", get("bsky-bot"), get("jetstream-bsky")),
      servicePart("Nagi botたん", get("nagi-bot"), get("jetstream-nagi")),
      servicePart("Nagi AppView", get("nagi-appview"), get("jetstream-appview")),
    ]),
    localLlm: tile([partFromProbe("Ollama", localLlmProbe)]),
    gemini: tile([partFromHeartbeat("Gemini", get("gemini"), GEMINI_FRESH_MS, GEMINI_DOWN_MS)]),
  };

  cached = snapshot;
  return snapshot;
}

/** 直近に組み立てた結果。WS のブロードキャストは毎回 DB を叩かずこれを使う。 */
export function getCachedHealthSnapshot(): HealthSnapshot | null {
  return cached;
}

export function startHealthMonitor(): () => void {
  const runProbes = async () => {
    localLlmProbe = await probeLocalLlm();
    await buildHealthSnapshot();
  };

  void runProbes().catch((e) => console.error("[ERROR][BIO][HEALTH] Initial probe failed:", e));

  const timer = setInterval(() => {
    void runProbes().catch((e) => console.error("[ERROR][BIO][HEALTH] Probe failed:", e));
  }, PROBE_INTERVAL_MS);
  timer.unref();

  return () => clearInterval(timer);
}
