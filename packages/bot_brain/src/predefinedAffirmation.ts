import { ollamaChat as sharedOllamaChat } from "./ollamaChat.js";
import wordNeg from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_negative.json" with { type: "json" };
import wordNrm from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_normal.json" with { type: "json" };
import wordPos from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_positive.json" with { type: "json" };
import wordNegEn from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_negative_en.json" with { type: "json" };
import wordNrmEn from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_normal_en.json" with { type: "json" };
import wordPosEn from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_positive_en.json" with { type: "json" };
import wordHny from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_hny.json" with { type: "json" };
import wordMorning from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_morning.json" with { type: "json" };
import wordNight from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_night.json" with { type: "json" };
import wordGj from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_gj.json" with { type: "json" };

export type SentimentLabel =
  "negative" | "neutral" | "positive" | "morning" | "night" | "gj" | "hny";

type Dependencies = {
  classify?: (text: string) => Promise<SentimentLabel>;
  select?: (templates: string[], text: string) => Promise<number>;
  translate?: (text: string, targetLang: string) => Promise<string>;
};

/** モデル選択はレジストリ（OLLAMA_PREDEFINED_AFFIRMATION）に任せる薄い束縛。 */
const ollamaChat = (
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<string> =>
  sharedOllamaChat("OLLAMA_PREDEFINED_AFFIRMATION", messages, { maxTokens });

const CLASSIFY_SYSTEM_PROMPT = `Classify the following text into exactly one of these 7 categories and reply with only that word:
- morning  : morning greetings (good morning, おはよう, etc.)
- night    : good night / sleep greetings (おやすみ, etc.)
- gj       : expressions of effort, fatigue, or "good job" (お疲れ様, etc.)
- hny      : New Year greetings (新年, あけまして, Happy New Year, etc.)
- negative : negative sentiment or complaints
- positive : positive sentiment, joy, or excitement
- neutral  : anything else`;

export async function classifyPredefinedAffirmation(
  text: string,
): Promise<SentimentLabel> {
  try {
    const raw = await ollamaChat(
      [
        { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      10,
    );
    const lower = raw.toLowerCase().trim();
    if (lower.includes("morning")) return "morning";
    if (lower.includes("night")) return "night";
    if (lower.includes("gj")) return "gj";
    if (lower.includes("hny")) return "hny";
    if (lower.includes("negative")) return "negative";
    if (lower.includes("positive")) return "positive";
    return "neutral";
  } catch (error) {
    console.warn(
      "[WARN][predefinedAffirmation] classify failed, defaulting to neutral:",
      error,
    );
    return "neutral";
  }
}

export async function selectPredefinedAffirmationIndex(
  templates: string[],
  postText: string,
): Promise<number> {
  const list = templates
    .map((template, index) => `${index}: ${template}`)
    .join("\n");
  try {
    const raw = await ollamaChat(
      [
        {
          role: "system",
          content:
            "以下の定型文リストから、ユーザーの投稿に最もふさわしい1件を選び、その番号（0始まり）のみを返してください。他の文字は不要です。",
        },
        {
          role: "user",
          content: `ユーザーの投稿:\n${postText}\n\n定型文:\n${list}`,
        },
      ],
      5,
    );
    const index = Number.parseInt(raw.match(/\d+/)?.[0] ?? "", 10);
    if (Number.isInteger(index) && index >= 0 && index < templates.length) {
      return index;
    }
  } catch (error) {
    console.warn(
      "[WARN][predefinedAffirmation] select failed, using random:",
      error,
    );
  }
  return Math.floor(Math.random() * templates.length);
}

export async function translatePredefinedAffirmation(
  text: string,
  targetLang: string,
): Promise<string> {
  try {
    const translated = await ollamaChat(
      [
        {
          role: "system",
          content: `Translate the following text to ${targetLang}. Keep the placeholder \${name} exactly as-is (do not translate it). Return only the translated text.`,
        },
        { role: "user", content: text },
      ],
      200,
    );
    return translated || text;
  } catch (error) {
    console.warn(
      "[WARN][predefinedAffirmation] translate failed, using original:",
      error,
    );
    return text;
  }
}

function candidateTemplates(
  label: SentimentLabel,
  japanese: boolean,
): string[] {
  switch (label) {
    case "morning":
      return wordMorning;
    case "night":
      return wordNight;
    case "gj":
      return wordGj;
    case "hny":
      return wordHny;
    case "negative":
      return japanese ? wordNeg : wordNegEn;
    case "positive":
      return japanese ? wordPos : wordPosEn;
    default:
      return japanese ? wordNrm : wordNrmEn;
  }
}

export async function predefinedAffirmation(
  input: {
    text: string;
    languageName: string;
    displayName: string;
  },
  dependencies: Dependencies = {},
): Promise<string> {
  const classify = dependencies.classify ?? classifyPredefinedAffirmation;
  const select = dependencies.select ?? selectPredefinedAffirmationIndex;
  const translate = dependencies.translate ?? translatePredefinedAffirmation;
  const japanese = input.languageName === "日本語";
  const label = await classify(input.text);
  const templates = candidateTemplates(label, japanese);
  const index = await select(templates, input.text);
  const selected = templates[index] ?? templates[0];
  const localized =
    japanese || input.languageName === "English"
      ? selected
      : await translate(selected, input.languageName);
  return localized.replaceAll("${name}", input.displayName);
}
