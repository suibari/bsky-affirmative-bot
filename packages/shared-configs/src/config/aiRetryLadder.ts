/**
 * AI呼び出しの失敗分類と「モデルを上げながら再試行する」ラダー実行。
 *
 * 元は apps/nagi_bot_server の nagiReplyRetry.ts にあった分類ロジックで、
 * Nagi リプライの永続キュー専用だった。日記（Bluesky / Nagi 両方）からも同じ判定が
 * 必要になったので aiRoutes.ts の隣へ移設し、リプライ側は薄いラッパで委譲している。
 * bot_brain ではなくここに置くのは、これが純粋な分類・待ち時間計算であって
 * Gemini クライアントにも DB にも触らないため（テストもそのぶん軽く保てる）。
 *
 * リプライは「1ワーカーパス = 1試行」を DB に持つ永続キューなのでラダーの段だけ借りる。
 * こちらの runWithAiLadder は「1プロセス内で待ちながら段を上げる」用途で、
 * 日記のように1日1回しか機会が無く、キューを立てるほどでもない処理が使う。
 */
import { resolveAiRoute, type AiFeatureKey } from "./aiRoutes.js";

export type AiErrorCategory = "transient" | "permanent" | "unknown";

export type AiErrorClassification = {
  category: AiErrorCategory;
  status?: number;
  code?: string;
};

/** ラダーの1段が指すモデルと tier。undefined の tier は「serviceTier を送らない」。 */
export type AiRouteDetails = {
  model: string;
  serviceTier?: "flex" | "standard";
};

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current) && chain.length < 8) {
    chain.push(current);
    seen.add(current);
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return chain;
}

function numericStatus(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{3}$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

/**
 * Gemini の ApiError は状態コードをオブジェクトに載せず
 * `{"error":{"code":503,"message":"..."}}` という文字列として投げてくることがある。
 * 503 を transient と判定できるかはこの正規表現に懸かっている。
 */
function statusFromMessage(message: string): number | undefined {
  const match = message.match(
    /(?:"code"\s*:\s*|status(?:Code)?["']?\s*[:=]\s*|\bHTTP\s+)(\d{3})\b/i,
  );
  return match ? Number(match[1]) : undefined;
}

/** エラー連鎖をたどって status / code を拾い、再試行してよいかを決める。 */
export function classifyAiError(error: unknown): AiErrorClassification {
  let status: number | undefined;
  let code: string | undefined;

  for (const item of errorChain(error)) {
    if (item instanceof Error) {
      status ??= statusFromMessage(item.message);
    }
    if (!item || typeof item !== "object") continue;
    const candidate = item as {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
    };
    status ??=
      numericStatus(candidate.status) ??
      numericStatus(candidate.statusCode) ??
      numericStatus(candidate.code);
    if (typeof candidate.code === "string") code ??= candidate.code;
  }

  if (status === 400 || status === 401 || status === 403) {
    return { category: "permanent", status, ...(code ? { code } : {}) };
  }
  if (
    status === 408 ||
    status === 429 ||
    (status !== undefined && status >= 500 && status <= 599) ||
    (code !== undefined && TRANSIENT_NETWORK_CODES.has(code))
  ) {
    return {
      category: "transient",
      ...(status !== undefined ? { status } : {}),
      ...(code ? { code } : {}),
    };
  }
  return {
    category: "unknown",
    ...(status !== undefined ? { status } : {}),
    ...(code ? { code } : {}),
  };
}

/** エラー連鎖を1行に潰す。原因が cause の奥にあることが多いので全部並べる。 */
export function formatAiError(error: unknown): string {
  const messages = errorChain(error)
    .map((item) => (item instanceof Error ? item.message : String(item)))
    .filter((message, index, all) => message && all.indexOf(message) === index);
  return messages.join(" | caused by: ").slice(0, 4_000);
}

/**
 * 「何回目までをこの機能キーで投げるか」の1段。
 * 段の刻み方はラダー定義側、各段が実際にどのモデル・tier になるかは
 * shared-configs の AI_FEATURES と AI_ROUTE_<キー> が決める。
 */
export type AiLadderStep = { untilAttempt: number; feature: AiFeatureKey };

export type AiLadderOptions<T> = {
  ladder: readonly AiLadderStep[];
  /** 試行 n 回目が失敗したあとの待ち時間。溢れたら最後の値を使い回す。 */
  delaysMs: readonly number[];
  /** 開始時刻からの打ち切り上限。次の試行がこれを越えるならそこで諦める。 */
  deadlineMs: number;
  maxAttempts: number;
  /** 分類できないエラーはモデルを上げても直らないことが多いので早めに打ち切る。 */
  unknownMaxAttempts?: number;
  /** ログ用の識別子。例: "[NAGI][did:plc:xxx][DIARY]" */
  label: string;
  /** ログに出す処理名。例: "generateUserDiary" */
  operation: string;
  run: (route: AiRouteDetails, attempt: number) => Promise<T>;
  // --- 以下はテスト注入用 ---
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  logger?: { warn: (message: string) => void };
};

const DEFAULT_UNKNOWN_MAX_ATTEMPTS = 5;

/** 試行回数からラダーの段を引き、実モデル・tier に解決する。 */
export function aiRouteForAttempt(
  ladder: readonly AiLadderStep[],
  attempt: number,
): AiRouteDetails {
  const step =
    ladder.find((candidate) => attempt <= candidate.untilAttempt) ??
    ladder[ladder.length - 1];
  const resolved = resolveAiRoute(step.feature);
  // ResolvedAiRoute をそのまま返さない。feature/provider/source が混ざると
  // 呼び出し側やログ/テストが余計なフィールドを見てしまうので2項目に射影する。
  return {
    model: resolved.model,
    ...(resolved.serviceTier ? { serviceTier: resolved.serviceTier } : {}),
  };
}

function formatDelay(ms: number): string {
  return ms >= 60_000 ? `${Math.round(ms / 60_000)}m` : `${Math.round(ms / 1_000)}s`;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 失敗するたびにラダーの段を上げながら再試行する。
 * 平常時は1回目（＝最も安い段）で完了するので、コストは再試行が起きたときだけ増える。
 */
export async function runWithAiLadder<T>(options: AiLadderOptions<T>): Promise<T> {
  const {
    ladder,
    delaysMs,
    deadlineMs,
    maxAttempts,
    unknownMaxAttempts = DEFAULT_UNKNOWN_MAX_ATTEMPTS,
    label,
    operation,
    run,
    now = () => Date.now(),
    sleep = defaultSleep,
    random = Math.random,
    logger = console,
  } = options;

  const startedAt = now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const route = aiRouteForAttempt(ladder, attempt);
    try {
      return await run(route, attempt);
    } catch (error) {
      lastError = error;
      const { category, status, code } = classifyAiError(error);
      const routeLabel = `model=${route.model}, tier=${route.serviceTier ?? "auto"}`;
      const detail = [
        category,
        status !== undefined ? `status=${status}` : undefined,
        code ? `code=${code}` : undefined,
        routeLabel,
      ]
        .filter(Boolean)
        .join(", ");

      const giveUpReason =
        category === "permanent"
          ? "permanent error"
          : category === "unknown" && attempt >= unknownMaxAttempts
            ? `unknown error x${attempt}`
            : attempt >= maxAttempts
              ? "attempts exhausted"
              : undefined;
      if (giveUpReason) {
        logger.warn(
          `[WARN]${label} ${operation} attempt ${attempt}/${maxAttempts} failed (${detail}), giving up: ${giveUpReason}: ${formatAiError(error)}`,
        );
        throw error;
      }

      const baseDelay = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      const delay = Math.round(baseDelay * (0.8 + random() * 0.4));
      if (now() + delay - startedAt >= deadlineMs) {
        logger.warn(
          `[WARN]${label} ${operation} attempt ${attempt}/${maxAttempts} failed (${detail}), giving up: deadline reached: ${formatAiError(error)}`,
        );
        throw error;
      }

      logger.warn(
        `[WARN]${label} ${operation} attempt ${attempt}/${maxAttempts} failed (${detail}), retrying in ${formatDelay(delay)}: ${formatAiError(error)}`,
      );
      await sleep(delay);
    }
  }

  // maxAttempts >= 1 ならループ内で必ず return か throw する。0以下で呼ばれた場合の保険。
  throw lastError ?? new Error(`${operation} was not attempted`);
}
