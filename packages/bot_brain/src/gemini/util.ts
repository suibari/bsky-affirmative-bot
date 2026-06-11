import { PartListUnion, Type, ServiceTier } from "@google/genai";
import { gemini } from "./index.js";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION, POST_TEXT_LIMIT } from "@bsky-affirmative-bot/shared-configs";
import { UserInfoGemini, GeminiScore, BotContext, LanguageName } from "@bsky-affirmative-bot/shared-configs";
import { MemoryService } from "@bsky-affirmative-bot/database";

function energyLabel(energy: number, ja: boolean): string {
  if (energy >= 80) return ja ? "めちゃくちゃ元気！" : "Super energetic!";
  if (energy >= 60) return ja ? "元気" : "Energetic";
  if (energy >= 40) return ja ? "まあまあ" : "So-so";
  if (energy >= 20) return ja ? "ちょっとお疲れ気味…" : "A bit tired...";
  return ja ? "ぐったり…" : "Exhausted...";
}

export function formatBotContext(botContext?: BotContext, langStr?: LanguageName): string {
  if (!botContext) return "";
  if (langStr === "日本語") {
    return `\n---\n## botたんの現在状況（参考にして返答をパーソナライズしてください）\n- 日時：${botContext.datetime}\n- 天気：${botContext.weather}\n- いまやってること：${botContext.botActivity}\n- 元気度：${energyLabel(botContext.botEnergy, true)}\n`;
  }
  return `\n---\n## Bot's current situation (use this to personalize your response)\n- Date/Time: ${botContext.datetime}\n- Weather: ${botContext.weather}\n- Currently: ${botContext.botActivityEn}\n- Energy: ${energyLabel(botContext.botEnergy, false)}\n`;
}

/**
 * POST_TEXT_LIMITを超える場合はリトライするgenerateContentのラッパー
 * userinfo が渡された場合、プロンプトの末尾に共通コンテキスト（日時・天気・bot状態）を自動付与する
 */
export async function generateContentWithRetry(params: any, retryCount = 3, userinfo?: UserInfoGemini): Promise<any> {
  if (userinfo?.botContext) {
    const botCtx = formatBotContext(userinfo.botContext, userinfo.langStr);
    if (Array.isArray(params.contents) && typeof params.contents[0] === 'string') {
      params = { ...params, contents: [params.contents[0] + botCtx, ...params.contents.slice(1)] };
    } else if (typeof params.contents === 'string') {
      params = { ...params, contents: params.contents + botCtx };
    }
  }

  let response;
  for (let i = 0; i <= retryCount; i++) {
    // APIの接続や高負荷エラー（503等）は内部リトライせず、上位関数（callbacks.ts）の一元リトライに即座に委ねる
    response = await gemini.models.generateContent(params);
    const text = response.text || "";

    // Increment RPD on success
    MemoryService.incrementStats('rpd', 1).catch((e: any) => console.error("Failed to increment RPD:", e));

    // 文字数制限チェック（文字数超過時のみ、モデル生成のやり直しとして内部リトライを許容）
    if (text.length <= POST_TEXT_LIMIT) {
      return response;
    }
    console.warn(`[WARN] Generated content exceeded ${POST_TEXT_LIMIT} characters (${text.length}). Retrying... (${i + 1}/${retryCount})`);
  }
  console.warn(`[WARN] Failed to generate content under 2000 characters after ${retryCount} retries. Returning last response.`);
  return response;
}

/**
 * 必要に応じて画像を付与してシングルレスポンスを得る
 */
export async function generateSingleResponse(prompt: string, userinfo?: UserInfoGemini): Promise<string> {
  const contents: PartListUnion = [prompt];

  if (userinfo?.image) {
    for (const img of userinfo.image) {
      try {
        const response = await fetch(img.image_url);
        if (!response.ok) {
          console.warn(`[WARN] Failed to fetch image: ${img.image_url} (Status: ${response.status})`);
          continue;
        }
        const imageArrayBuffer = await response.arrayBuffer();
        const base64ImageData = Buffer.from(imageArrayBuffer).toString("base64");
        contents.push({
          inlineData: {
            mimeType: img.mimeType,
            data: base64ImageData,
          }
        });
      } catch (e) {
        console.warn(`[WARN] Error fetching image: ${img.image_url}`, e);
        continue;
      }
    }
  }

  const response = await generateContentWithRetry({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      serviceTier: userinfo?.isSubscriber ? ServiceTier.STANDARD : ServiceTier.FLEX,
      tools: [
        {
          googleSearch: {},
        }
      ]
    }
  }, 3, userinfo);

  // Gemini出力の"["から"]"まで囲われたすべての部分を除去
  const responseText = response.text || "";
  const cleanedText = responseText.replace(/\[.*?\]/gs, '');

  return cleanedText;
}

/**
 * 必要に応じて画像を付与して、botたんスコア付きのシングルレスポンスを得る
 */
export function extractJSON(text: string): any {
  try {
    // 1. Markdownのコードブロックを抽出
    const match = text.match(/```json\n([\s\S]*?)\n```/);
    if (match) {
      return JSON.parse(match[1]);
    }

    // 2. コードブロックがない場合、最初と最後の括弧を探して抽出
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // 3. そのままパースを試みる
    return JSON.parse(text);
  } catch (e) {
    console.warn("JSON parse failed:", text);
    throw new Error("Failed to extract JSON from response");
  }
}

/**
 * 必要に応じて画像を付与して、botたんスコア付きのシングルレスポンスを得る
 */
export async function generateSingleResponseWithScore(prompt: string, userinfo?: UserInfoGemini) {
  const contents: PartListUnion = [prompt];
  // const responseSchema = { ... } // Removed due to conflict with Google Search

  if (userinfo?.image) {
    for (const img of userinfo.image) {
      try {
        const response = await fetch(img.image_url);
        if (!response.ok) {
          console.warn(`[WARN] Failed to fetch image: ${img.image_url} (Status: ${response.status})`);
          continue;
        }
        const imageArrayBuffer = await response.arrayBuffer();
        const base64ImageData = Buffer.from(imageArrayBuffer).toString("base64");
        contents.push({
          inlineData: {
            mimeType: img.mimeType,
            data: base64ImageData,
          }
        });
      } catch (e) {
        console.warn(`[WARN] Error fetching image: ${img.image_url}`, e);
        continue;
      }
    }
  }

  const tools: any[] = [
    {
      googleSearch: {},
    }
  ];

  if (userinfo?.embed?.uri_embed && userinfo.isSubscriber) {
    tools.push({
      urlContext: {},
    });
    console.log(`[INFO][GEMINI] URL Context tool enabled for URL: ${userinfo.embed.uri_embed}`);
  }

  const response = await generateContentWithRetry({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      serviceTier: userinfo?.isSubscriber ? ServiceTier.STANDARD : ServiceTier.FLEX,
      // responseMimeType: "application/json", // Removed
      // responseSchema, // Removed
      tools
    }
  }, 3, userinfo);

  const result = extractJSON(response.text || "") as GeminiScore[];

  // Gemini出力の"["から"]"まで囲われたすべての部分を除去
  // (検索引用などが残っていた場合のクリーニング)
  if (Array.isArray(result)) {
    result.forEach(item => {
      if (item.comment) {
        item.comment = item.comment.replace(/\[.*?\]/gs, '');
      }
    });
    return result[0];
  } else {
    // 配列でない場合（単一オブジェクトで返ってきた場合など）のフォールバック
    const singleResult = result as unknown as GeminiScore;
    if (singleResult.comment) {
      singleResult.comment = singleResult.comment.replace(/\[.*?\]/gs, '');
    }
    return singleResult;
  }
}

// Extracted to shared-configs

/**
 * テキスト内のURLの前後に半角スペースを保証する（Bluesky誤パース防止）
 * URLの末尾に混入した句読点・括弧類も除去する
 */
export const normalizeUrlSpacing = (text: string): string =>
  text
    .replace(/https?:\/\/[^\s]+/g, (url) =>
      url.replace(/[.。、，,！？!?「」『』【】（）\[\]{}]+$/, '')
    )
    .replace(/([^\s])(https?:\/\/)/g, '$1 $2')
    .replace(/(https?:\/\/[\x21-\x7E]+)([^\s\x00-\x7F])/g, '$1 $2');

/**
 * JSONレスポンスの生成とパースを行う共通ヘルパー
 * パースに失敗した場合は例外を投げ、callbacks.tsの共通リトライ機構に処理を委ねます。
 */
export async function generateSingleResponseJSON<T>(
  prompt: string,
  userinfo: UserInfoGemini | undefined,
  parser: (text: string) => T
): Promise<T> {
  const responseText = await generateSingleResponse(prompt, userinfo);
  return parser(responseText);
}
