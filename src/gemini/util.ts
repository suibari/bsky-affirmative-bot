import { PartListUnion, Type } from "@google/genai";
import { gemini } from ".";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "../config";
import { GeminiScore, UserInfoGemini } from "../types";
import rawWhatday from '../json/anniversary.json' assert { type: 'json' };
import { WhatDayMap } from '../types.js';
const whatday: WhatDayMap = rawWhatday;

export function getRandomItems(array: string[], count: number) {
  if (count > array.length) {
    throw new Error("Requested count exceeds array length");
  }

  const shuffled = array.slice(); // 配列を複製してシャッフル
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); // ランダムなインデックスを選択
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // 値を交換
  }

  return shuffled.slice(0, count); // シャッフルされた配列から先頭の要素を取得
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

  const response = await gemini.models.generateContent({
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

  const response = await gemini.models.generateContent({
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

export function getFullDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1);
  const date = String(now.getDate());

  return `${year}年${month}月${date}日`;
}

export function getFullDateAndTimeString(): string {
  const fulldate = getFullDateString();
  const now = new Date();
  const hours = String(now.getHours());
  const minutes = String(now.getMinutes());

  return `${fulldate}${hours}時${minutes}分`;
}

export function getWhatDay() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1);
  const date = String(now.getDate());

  return whatday[month][date];
}