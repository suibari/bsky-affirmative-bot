import { PartListUnion, Type } from "@google/genai";
import { gemini } from ".";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "@bsky-affirmative-bot/shared-configs";
import { UserInfoGemini, GeminiScore } from "@bsky-affirmative-bot/shared-configs";


// Extracted to shared-configs

/**
 * 2000文字を超える場合はリトライするgenerateContentのラッパー
 */
export async function generateContentWithRetry(params: any, retryCount = 3): Promise<any> {
  let response;
  for (let i = 0; i <= retryCount; i++) {
    try {
      response = await gemini.models.generateContent(params);
      const text = response.text || "";
      if (text.length <= 2000) {
        return response;
      }
      console.warn(`[WARN] Generated content exceeded 2000 characters (${text.length}). Retrying... (${i + 1}/${retryCount})`);
    } catch (e) {
      console.error(`[ERROR] generateContent failed. Retrying... (${i + 1}/${retryCount})`, e);
      if (i === retryCount) throw e;
    }
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
      tools: [
        {
          googleSearch: {},
        }
      ]
    }
  });

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

  const response = await generateContentWithRetry({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      // responseMimeType: "application/json", // Removed
      // responseSchema, // Removed
      tools: [
        {
          googleSearch: {},
        }
      ]
    }
  });

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