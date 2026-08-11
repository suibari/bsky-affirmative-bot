import {
  predefinedAffirmation,
  type PredefinedAffirmationDependencies,
  type SentimentLabel,
} from "@bsky-affirmative-bot/bot-brain/predefined-affirmation";
import {
  classifyPredefinedReply,
  type PredefinedReplyClassification,
} from "./predefinedReplyClassifier.js";

export type BskyPredefinedSelectorMode = "random" | "llm";

export function parseBskyPredefinedSelectorMode(
  value: string | undefined,
): BskyPredefinedSelectorMode {
  const normalized = value?.trim() || "random";
  if (normalized === "random" || normalized === "llm") return normalized;
  throw new Error(
    `BSKY_PREDEFINED_SELECTOR must be random or llm; received ${JSON.stringify(value)}`,
  );
}

export const BSKY_PREDEFINED_SELECTOR_MODE =
  parseBskyPredefinedSelectorMode(process.env.BSKY_PREDEFINED_SELECTOR);

type Dependencies = {
  classify?: typeof classifyPredefinedReply;
  affirm?: typeof predefinedAffirmation;
  random?: () => number;
  selectorMode?: BskyPredefinedSelectorMode;
  translate?: PredefinedAffirmationDependencies["translate"];
};

const randomIndex = (length: number, random: () => number): number =>
  Math.min(length - 1, Math.floor(random() * length));

export async function createBskyPredefinedReply(
  input: {
    text: string;
    languageName: string;
    displayName: string;
  },
  dependencies: Dependencies = {},
): Promise<string> {
  const classification = await (
    dependencies.classify ?? classifyPredefinedReply
  )({
    text: input.text,
    languageName: input.languageName,
    method: "rules-ollama-three-way",
  });
  const selectorMode =
    dependencies.selectorMode ?? BSKY_PREDEFINED_SELECTOR_MODE;
  console.info("[INFO][predefinedReply] classified", {
    method: classification.method,
    label: classification.label,
    latencyMs: Math.round(classification.latencyMs),
    llmCalls: classification.llmCalls,
    specialRule: classification.specialRule,
    selectorMode,
    failure: classification.error ? "classification-error" : null,
  });

  const affirmationDependencies: PredefinedAffirmationDependencies = {
    classify: async (): Promise<SentimentLabel> => classification.label,
  };
  if (selectorMode === "random") {
    const random = dependencies.random ?? Math.random;
    affirmationDependencies.select = async (templates) =>
      randomIndex(templates.length, random);
  }
  if (dependencies.translate) {
    affirmationDependencies.translate = dependencies.translate;
  }

  return (dependencies.affirm ?? predefinedAffirmation)(
    input,
    affirmationDependencies,
  );
}

export type { PredefinedReplyClassification };
