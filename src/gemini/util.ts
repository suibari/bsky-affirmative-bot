import { PartListUnion, Type } from "@google/genai";
import { gemini } from ".";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "../config";
import { GeminiSchemaWithScore, GeminiScore, UserInfoGemini } from "../types";

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
export async function generateSingleResponse (prompt: string, userinfo?: UserInfoGemini) {
  const contents: PartListUnion = [prompt];

  if (userinfo?.image_url && userinfo?.image_mimeType) {
    const response = await fetch(userinfo.image_url);
    const imageArrayBuffer = await response.arrayBuffer();
    const base64ImageData = Buffer.from(imageArrayBuffer).toString("base64");
    contents.push({
      inlineData: {
        mimeType: userinfo.image_mimeType,
        data: base64ImageData,
      }
    });
  }

  const response = await gemini.models.generateContent({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    }
  });

  return response;
}

/**
 * 必要に応じて画像を付与して、botたんスコア付きのシングルレスポンスを得る
 */
export async function generateSingleResponseWithScore (prompt: string, userinfo?: UserInfoGemini) {
  const contents: PartListUnion = [prompt];
  const responseSchema: GeminiSchemaWithScore = {
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

  if (userinfo?.image_url && userinfo?.image_mimeType) {
    const response = await fetch(userinfo.image_url);
    const imageArrayBuffer = await response.arrayBuffer();
    const base64ImageData = Buffer.from(imageArrayBuffer).toString("base64");
    contents.push({
      inlineData: {
        mimeType: userinfo.image_mimeType,
        data: base64ImageData,
      }
    });
  }

  const response = await gemini.models.generateContent({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema,
    }
  });
  const result = JSON.parse(response.text || "") as GeminiScore[];

  return result[0];
}
