import { PartListUnion, Type } from "@google/genai";
import { MODEL_GEMINI_LITE } from "../config/index.js";
import { UserInfoGemini } from "../types.js";
import { gemini } from "./index.js";
import { logger } from "../logger/index.js";

type GeminiJudgeResult = {
  result: boolean;
  comment: string;
}

export async function judgeReplySubject(userinfo: UserInfoGemini) {
  const SCHEMA_CHECKCHEER = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        result: {
          type: Type.BOOLEAN,
        },
        comment: {
          type: Type.STRING,
        }
      },
      propertyOrdering: ["result", "comment"],
    }
  }

  const prompt = 
`
以下のユーザのポストに全肯定リプライしてよいか、ジャッジを行ってください。
resultに、リプライしてよいならtrue, リプライNGならfalseを出力してください。
commentには、そう判断した理由を出力してください。
ジャッジのポイントは以下です。
* メンズエステなどの風俗店の宣伝ポストはNG
* 寄付を募るポストはNG
* botによる自動ポストはNG
* 過激な性描写ポストはNG（下着姿くらいはOK）
* これ以外のポストはOK
-----この下がユーザのポストです-----
ユーザ名: ${userinfo.follower.displayName}
文章: ${userinfo.posts?.[0] || ""}`;

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
    model: MODEL_GEMINI_LITE,
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: SCHEMA_CHECKCHEER,
    }
  });
  const result = JSON.parse(response.text || "") as GeminiJudgeResult[];

  // Geminiリクエスト数加算
  logger.addRPD();

  return result[0];
}
