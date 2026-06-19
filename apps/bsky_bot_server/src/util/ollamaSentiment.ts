export type SentimentLabel = "negative" | "neutral" | "positive" | "morning" | "night" | "gj" | "hny";

const OLLAMA_BASE_URL = () => process.env.OLLAMA_BASE_URL!;
const OLLAMA_MODEL    = () => process.env.OLLAMA_MODEL!;

async function ollamaChat(messages: { role: string; content: string }[], maxTokens: number): Promise<string> {
  const response = await fetch(`${OLLAMA_BASE_URL()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL(),
      messages,
      temperature: 0,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = await response.json() as any;
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

const CLASSIFY_SYSTEM_PROMPT = `Classify the following text into exactly one of these 7 categories and reply with only that word:
- morning  : morning greetings (good morning, おはよう, etc.)
- night    : good night / sleep greetings (おやすみ, etc.)
- gj       : expressions of effort, fatigue, or "good job" (お疲れ様, etc.)
- hny      : New Year greetings (新年, あけまして, Happy New Year, etc.)
- negative : negative sentiment or complaints
- positive : positive sentiment, joy, or excitement
- neutral  : anything else`;

export async function classifySentimentOllama(text: string): Promise<SentimentLabel> {
  try {
    const raw = await ollamaChat([
      { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
      { role: "user",   content: text },
    ], 10);
    const lower = raw.toLowerCase().trim();
    if (lower.includes("morning"))  return "morning";
    if (lower.includes("night"))    return "night";
    if (lower.includes("gj"))       return "gj";
    if (lower.includes("hny"))      return "hny";
    if (lower.includes("negative")) return "negative";
    if (lower.includes("positive")) return "positive";
    return "neutral";
  } catch (e) {
    console.warn("[WARN][ollamaSentiment] classify failed, defaulting to neutral:", e);
    return "neutral";
  }
}

export async function selectTemplateOllama(templates: string[], postText: string): Promise<number> {
  const list = templates.map((t, i) => `${i}: ${t}`).join("\n");
  try {
    const raw = await ollamaChat([
      {
        role: "system",
        content: "以下の定型文リストから、ユーザーの投稿に最もふさわしい1件を選び、その番号（0始まり）のみを返してください。他の文字は不要です。",
      },
      {
        role: "user",
        content: `ユーザーの投稿:\n${postText}\n\n定型文:\n${list}`,
      },
    ], 5);
    const idx = parseInt(raw.match(/\d+/)?.[0] ?? "", 10);
    if (!isNaN(idx) && idx >= 0 && idx < templates.length) return idx;
  } catch (e) {
    console.warn("[WARN][ollamaSentiment] select failed, using random:", e);
  }
  return Math.floor(Math.random() * templates.length);
}

export async function translateTemplateOllama(text: string, targetLang: string): Promise<string> {
  try {
    const raw = await ollamaChat([
      {
        role: "system",
        content: `Translate the following text to ${targetLang}. Keep the placeholder \${name} exactly as-is (do not translate it). Return only the translated text.`,
      },
      { role: "user", content: text },
    ], 200);
    return raw || text;
  } catch (e) {
    console.warn("[WARN][ollamaSentiment] translate failed, using original:", e);
    return text;
  }
}
