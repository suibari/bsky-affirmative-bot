import { aiModel } from "@bsky-affirmative-bot/shared-configs";
import type { AiFeatureKey } from "@bsky-affirmative-bot/shared-configs";

export type OllamaMessage = { role: string; content: string };

export type OllamaChatOptions = {
  /** 生成の上限トークン。分類なら数トークン、描写なら数百。 */
  maxTokens: number;
  /** 既定は 0（決定論寄り）。描写のように毎回変えたい用途では上げる。 */
  temperature?: number;
  /** 既定 30 秒。ローカルとはいえ長文生成は詰まりうる。 */
  timeoutMs?: number;
};

/** OLLAMA_BASE_URL / OLLAMA_MODEL の両方が揃っているときだけローカル推論を使う。 */
export const isOllamaConfigured = (): boolean =>
  Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_MODEL);

/**
 * ローカル Ollama（OpenAI 互換 /chat/completions）を叩く共通ラッパ。
 *
 * モデルの選択はレジストリに任せる（呼び出し側は feature キーを名乗る）。
 * OLLAMA_MODEL の「有無」だけは Ollama が設定済みかどうかの判定として使い続ける。
 */
export async function ollamaChat(
  feature: AiFeatureKey,
  messages: OllamaMessage[],
  options: OllamaChatOptions,
): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  if (!isOllamaConfigured()) throw new Error("Ollama is not configured");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: aiModel(feature),
      messages,
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = (await response.json()) as any;
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}
