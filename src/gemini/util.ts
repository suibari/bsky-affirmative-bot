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
export async function generateSingleResponse (prompt: string, userinfo?: UserInfoGemini): Promise<string> {
  const contents: PartListUnion = [prompt];

  if (userinfo?.image) {
    for (const img of userinfo.image) {
      const response = await fetch(img.image_url);
      const imageArrayBuffer = await response.arrayBuffer();
      const base64ImageData = Buffer.from(imageArrayBuffer).toString("base64");
      contents.push({
        inlineData: {
          mimeType: img.mimeType,
          data: base64ImageData,
        }
      });
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
export async function generateSingleResponseWithScore (prompt: string, userinfo?: UserInfoGemini) {
  const contents: PartListUnion = [prompt];
  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        comment: {
          type: Type.STRING,
        },
        score: {
          type: Type.INTEGER,
        },
      },
      propertyOrdering: ["comment", "score"],
    }
  }

  if (userinfo?.image) {
    for (const img of userinfo.image) {
      const response = await fetch(img.image_url);
      const imageArrayBuffer = await response.arrayBuffer();
      const base64ImageData = Buffer.from(imageArrayBuffer).toString("base64");
      contents.push({
        inlineData: {
          mimeType: img.mimeType,
          data: base64ImageData,
        }
      });
    }
  }

  const response = await gemini.models.generateContent({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema,
      tools: [
        {
          googleSearch: {},
        }
      ]
    }
  });
  
  const result = JSON.parse(response.text || "") as GeminiScore[];

  // Gemini出力の"["から"]"まで囲われたすべての部分を除去
  result.forEach(item => {
    item.comment = item.comment.replace(/\[.*?\]/gs, '');
  });

  return result[0];
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