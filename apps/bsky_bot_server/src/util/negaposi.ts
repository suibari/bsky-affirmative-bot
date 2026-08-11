import { NegaposiApiResponse } from "@bsky-affirmative-bot/shared-configs";

export type FetchSentimentOptions = {
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const isNegaposiResponse = (value: unknown): value is NegaposiApiResponse => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NegaposiApiResponse>;
  return (
    Array.isArray(candidate.wakati) &&
    Array.isArray(candidate.average_sentiments) &&
    candidate.average_sentiments.every(Number.isFinite) &&
    Array.isArray(candidate.nouns) &&
    Array.isArray(candidate.nouns_counts)
  );
};

export async function fetchSentiment(
  texts: string[],
  options: FetchSentimentOptions = {},
): Promise<NegaposiApiResponse> {
  const endpoint = options.endpoint ?? process.env.NEGAPOSI_URL;
  if (!endpoint) throw new Error("NEGPOSI_URL is not configured");
  if (texts.length === 0) throw new Error("At least one text is required");

  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  });

  if (!response.ok) {
    throw new Error(`NEGPOSI request failed with HTTP ${response.status}`);
  }

  const result = (await response.json()) as unknown;
  if (!isNegaposiResponse(result)) {
    throw new Error("NEGPOSI returned an invalid response");
  }
  if (result.average_sentiments.length !== texts.length) {
    throw new Error("NEGPOSI returned an unexpected result count");
  }

  return result;
}
