import {
  MODEL_GEMINI,
  MODEL_GEMINI_HIGH,
} from "@bsky-affirmative-bot/shared-configs";

export type NagiReplyErrorCategory = "transient" | "permanent" | "unknown";
export type NagiAiRoute = "lite-flex" | "lite-standard" | "flash-standard";

export type NagiReplyErrorClassification = {
  category: NagiReplyErrorCategory;
  status?: number;
  code?: string;
};

export type NagiAiRouteDetails = {
  route: NagiAiRoute;
  model: string;
  serviceTier: "flex" | "standard";
};

const DAY_MS = 24 * 60 * 60_000;
const UNKNOWN_MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [
  15_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  3 * 60 * 60_000,
  6 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

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

function statusFromMessage(message: string): number | undefined {
  const match = message.match(
    /(?:"code"\s*:\s*|status(?:Code)?["']?\s*[:=]\s*|\bHTTP\s+)(\d{3})\b/i,
  );
  return match ? Number(match[1]) : undefined;
}

export function classifyNagiReplyError(
  error: unknown,
): NagiReplyErrorClassification {
  let status: number | undefined;
  let code: string | undefined;
  let directImageFetchFailure = false;

  for (const item of errorChain(error)) {
    if (item instanceof Error) {
      status ??= statusFromMessage(item.message);
      directImageFetchFailure ||= item.message.includes(
        "Failed to fetch directly attached image",
      );
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

  // 直接添付は内側のHTTP状態にかかわらずジョブ全体を一時障害として扱う。
  // PDS/CDNの伝播待ちを24時間の永続キューで吸収し、画像を黙って省略しない。
  if (directImageFetchFailure) {
    return {
      category: "transient",
      ...(status !== undefined ? { status } : {}),
      ...(code ? { code } : {}),
    };
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

export function formatNagiReplyError(error: unknown): string {
  const messages = errorChain(error)
    .map((item) => (item instanceof Error ? item.message : String(item)))
    .filter((message, index, all) => message && all.indexOf(message) === index);
  return messages.join(" | caused by: ").slice(0, 4_000);
}

export function nagiAiRouteForAttempt(attempt: number): NagiAiRouteDetails {
  if (attempt <= 2) {
    return {
      route: "lite-flex",
      model: MODEL_GEMINI,
      serviceTier: "flex",
    };
  }
  if (attempt <= 4) {
    return {
      route: "lite-standard",
      model: MODEL_GEMINI,
      serviceTier: "standard",
    };
  }
  return {
    route: "flash-standard",
    model: MODEL_GEMINI_HIGH,
    serviceTier: "standard",
  };
}

export function nextNagiReplyAttemptAt(input: {
  attempt: number;
  category: NagiReplyErrorCategory;
  createdAt: Date;
  now: Date;
  random?: () => number;
}): Date | undefined {
  if (input.category === "permanent") return undefined;
  if (input.category === "unknown" && input.attempt >= UNKNOWN_MAX_ATTEMPTS) {
    return undefined;
  }

  const deadlineMs = input.createdAt.getTime() + DAY_MS;
  if (input.now.getTime() >= deadlineMs) return undefined;

  const baseDelay =
    RETRY_DELAYS_MS[Math.min(input.attempt - 1, RETRY_DELAYS_MS.length - 1)];
  const random = input.random ?? Math.random;
  const jitteredDelay = Math.round(baseDelay * (0.8 + random() * 0.4));
  return new Date(Math.min(input.now.getTime() + jitteredDelay, deadlineMs));
}
