import {
  HNY_WORDS,
  OHAYO_WORDS,
  OTSUKARE_WORDS,
  OYASUMI_WORDS,
  type NegaposiApiResponse,
} from "@bsky-affirmative-bot/shared-configs";
import {
  classifyPredefinedAffirmationStrict,
  type SentimentLabel,
} from "@bsky-affirmative-bot/bot-brain/predefined-affirmation";
import { ollamaChat } from "@bsky-affirmative-bot/bot-brain/ollama-chat";
import { fetchSentiment } from "../util/negaposi.js";

export const PREDEFINED_REPLY_CLASSIFIER_METHODS = [
  "legacy-dictionary",
  "ollama-seven-way",
  "ollama-special-then-polarity",
  "rules-ollama-three-way",
  "rules-dictionary-ollama-consensus",
] as const;

export const PREDEFINED_REPLY_CLASSIFIER_PROMPT_VERSION =
  "predefined-reply-classifier-v2";

export type PredefinedReplyClassifierMethod =
  (typeof PREDEFINED_REPLY_CLASSIFIER_METHODS)[number];
export type PolarityLabel = Extract<
  SentimentLabel,
  "negative" | "neutral" | "positive"
>;
export type SpecialOrOtherLabel = Extract<
  SentimentLabel,
  "morning" | "night" | "gj" | "hny"
> | "other";

export type PredefinedReplyClassification = {
  method: PredefinedReplyClassifierMethod;
  label: SentimentLabel;
  latencyMs: number;
  dictionaryScore?: number;
  llmCalls: number;
  specialRule: "legacy" | "direct" | "llm" | null;
  consensusDisagreement?: boolean;
  error?: string;
};

export type PredefinedReplyClassifierDependencies = {
  classifySevenWay?: (text: string) => Promise<SentimentLabel>;
  classifySpecial?: (text: string) => Promise<SpecialOrOtherLabel>;
  classifyThreeWay?: (text: string) => Promise<PolarityLabel>;
  fetchSentiment?: (texts: string[]) => Promise<NegaposiApiResponse>;
  now?: () => number;
};

const THREE_WAY_PROMPT = `Classify the emotional sentiment of the user's text into exactly one category.
Reply with only one word: negative, neutral, or positive.
- negative: distress, disappointment, anger, complaints, or an overall negative experience
- positive: joy, gratitude, satisfaction, hope, or an overall positive experience
- neutral: factual statements, unclear/mixed sentiment, or content whose sentiment belongs to someone else
Understand negation, double negation, quotation, and sarcasm from the whole sentence.`;

const SPECIAL_OR_OTHER_PROMPT = `Classify the user's whole post into exactly one category.
Reply with only one word: morning, night, gj, hny, or other.
- morning: the author is directly greeting someone good morning
- night: the author is directly saying good night
- gj: the author is directly acknowledging effort, or describing their own work completion, effort, or tiredness in a way suited to an "otsukaresama/good job" reply
- hny: the author is directly giving a New Year greeting
- other: none of the above
Words merely quoted, reported as somebody else's speech, discussed as words, mentioned in a title/example, or embedded in an explanation are other. Read the entire post; do not classify from a keyword alone.`;

const parsePolarity = (raw: string): PolarityLabel => {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "negative") return "negative";
  if (normalized === "positive") return "positive";
  if (normalized === "neutral") return "neutral";
  throw new Error("Ollama returned an invalid three-way classification");
};

const parseSpecialOrOther = (raw: string): SpecialOrOtherLabel => {
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === "morning" ||
    normalized === "night" ||
    normalized === "gj" ||
    normalized === "hny" ||
    normalized === "other"
  ) {
    return normalized;
  }
  throw new Error("Ollama returned an invalid special-or-other classification");
};

export async function classifySpecialOllama(
  text: string,
): Promise<SpecialOrOtherLabel> {
  const raw = await ollamaChat(
    "OLLAMA_PREDEFINED_AFFIRMATION",
    [
      { role: "system", content: SPECIAL_OR_OTHER_PROMPT },
      { role: "user", content: text },
    ],
    { maxTokens: 5 },
  );
  return parseSpecialOrOther(raw);
}

export async function classifyPolarityOllama(
  text: string,
): Promise<PolarityLabel> {
  const raw = await ollamaChat(
    "OLLAMA_PREDEFINED_AFFIRMATION",
    [
      { role: "system", content: THREE_WAY_PROMPT },
      { role: "user", content: text },
    ],
    { maxTokens: 5 },
  );
  return parsePolarity(raw);
}

const removeQuotedText = (text: string): string =>
  text
    .replace(/「[^」]*」|『[^』]*』/gu, " ")
    .replace(/"[^"]*"|'[^']*'/gu, " ");

const DIRECT_SPECIAL_PATTERNS: ReadonlyArray<{
  label: Extract<SentimentLabel, "morning" | "night" | "gj" | "hny">;
  pattern: RegExp;
}> = [
  {
    label: "hny",
    pattern:
      /^(?:あけましておめでとう|明けましておめでとう|あけおめ|happy new year)(?=$|[\s!！?？。、,.])/iu,
  },
  {
    label: "morning",
    pattern:
      /^(?:おはよう(?:ございます)?|おはよ|おはー+|おは|good morning)(?=$|[\s!！?？。、,.])/iu,
  },
  {
    label: "night",
    pattern:
      /(?:^|[\s!！?？。、,.])(?:おやすみ(?:なさい)?|おやすー*|good night)(?=$|[\s!！?？。、,.])/iu,
  },
  {
    label: "gj",
    pattern:
      /^(?:お疲れ(?:さま|様)?|おつかれ(?:さま)?|おつ|しごおわ|good job)(?=$|[\s!！?？。、,.])/iu,
  },
];

/** 引用を除外し、直接的かつ単一の挨拶だけを確定する。 */
export function detectDirectSpecialLabel(
  text: string,
): Extract<SentimentLabel, "morning" | "night" | "gj" | "hny"> | null {
  const normalized = removeQuotedText(text.normalize("NFKC")).trim();
  const matches = DIRECT_SPECIAL_PATTERNS.filter(({ pattern }) =>
    pattern.test(normalized),
  ).map(({ label }) => label);
  return matches.length === 1 ? matches[0] : null;
}

/** 2026-06以前の部分一致と後勝ち優先順位をそのまま再現する。 */
export function detectLegacySpecialLabel(text: string): SentimentLabel | null {
  let label: SentimentLabel | null = null;
  const conditions: Array<[readonly string[], SentimentLabel]> = [
    [HNY_WORDS, "hny"],
    [OHAYO_WORDS, "morning"],
    [OYASUMI_WORDS, "night"],
    [OTSUKARE_WORDS, "gj"],
  ];
  for (const [keywords, candidate] of conditions) {
    if (keywords.some((keyword) => text.includes(keyword))) label = candidate;
  }
  return label;
}

export function classifyDictionaryScore(
  score: number,
  languageName: string,
): PolarityLabel {
  const threshold = languageName === "日本語" ? 0.2 : 0.05;
  if (score <= -threshold) return "negative";
  if (score >= threshold) return "positive";
  return "neutral";
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function classifyPredefinedReply(
  input: {
    text: string;
    languageName: string;
    method: PredefinedReplyClassifierMethod;
  },
  dependencies: PredefinedReplyClassifierDependencies = {},
): Promise<PredefinedReplyClassification> {
  const now = dependencies.now ?? (() => performance.now());
  const startedAt = now();
  const base = {
    method: input.method,
    latencyMs: 0,
    llmCalls: 0,
    specialRule: null as "legacy" | "direct" | "llm" | null,
  };
  const finish = (
    result: Omit<PredefinedReplyClassification, keyof typeof base>,
  ): PredefinedReplyClassification => ({
    ...base,
    ...result,
    latencyMs: Math.max(0, now() - startedAt),
  });
  const dictionary = async () => {
    const response = await (dependencies.fetchSentiment ?? fetchSentiment)([
      input.text,
    ]);
    const score = response.average_sentiments[0];
    if (!Number.isFinite(score)) throw new Error("NEGPOSI score is invalid");
    return {
      label: classifyDictionaryScore(score, input.languageName),
      score,
    };
  };
  const threeWay = dependencies.classifyThreeWay ?? classifyPolarityOllama;

  try {
    if (input.method === "legacy-dictionary") {
      const special = detectLegacySpecialLabel(input.text);
      if (special) {
        base.specialRule = "legacy";
        return finish({ label: special });
      }
      const result = await dictionary();
      return finish({ label: result.label, dictionaryScore: result.score });
    }

    if (input.method === "ollama-seven-way") {
      base.llmCalls = 1;
      const label = await (
        dependencies.classifySevenWay ?? classifyPredefinedAffirmationStrict
      )(input.text);
      return finish({ label });
    }

    if (input.method === "ollama-special-then-polarity") {
      base.llmCalls = 1;
      const special = await (
        dependencies.classifySpecial ?? classifySpecialOllama
      )(input.text);
      if (special !== "other") {
        base.specialRule = "llm";
        return finish({ label: special });
      }
      base.llmCalls = 2;
      return finish({ label: await threeWay(input.text) });
    }

    const special = detectDirectSpecialLabel(input.text);
    if (special) {
      base.specialRule = "direct";
      return finish({ label: special });
    }

    if (input.method === "rules-ollama-three-way") {
      base.llmCalls = 1;
      return finish({ label: await threeWay(input.text) });
    }

    base.llmCalls = 1;
    const [dictionaryResult, llmResult] = await Promise.allSettled([
      dictionary(),
      threeWay(input.text),
    ]);
    if (
      dictionaryResult.status === "rejected" ||
      llmResult.status === "rejected"
    ) {
      const errors = [dictionaryResult, llmResult]
        .filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        )
        .map((result) => errorMessage(result.reason));
      return finish({ label: "neutral", error: errors.join("; ") });
    }
    const agrees = dictionaryResult.value.label === llmResult.value;
    return finish({
      label: agrees ? llmResult.value : "neutral",
      dictionaryScore: dictionaryResult.value.score,
      consensusDisagreement: !agrees,
    });
  } catch (error) {
    return finish({ label: "neutral", error: errorMessage(error) });
  }
}
