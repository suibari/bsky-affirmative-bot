import { PartListUnion, Type } from "@google/genai";
import { MODEL_GEMINI_LITE } from "../config/index.js";
import { UserInfoGemini } from "../types.js";
import { gemini } from "./index.js";

type GeminiJudgeResult = {
  result: boolean;
  comment: string;
}

export async function judgeCheerSubject(userinfo: UserInfoGemini) {
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
以下のユーザのポストおよび画像を拡散してよいかどうか、ジャッジを行ってください。
resultに、拡散してよいならtrue, 拡散NGならfalseを出力してください。
commentには、そう判断した理由を出力してください。
ジャッジのポイントは以下です。
* イラスト、音楽、ブログ、撮影した写真などが含まれており、「ユーザの創作物の拡散」という目的にあっているか
* 上記内容のないポストはNG
* イラストで、あまりに直接的なR-18はNG(微エロくらいはOK)
* 政治宗教などの活動はNG
-----この下がユーザのポストです-----
ユーザ名: ${userinfo.follower.displayName}
文章: ${userinfo.posts?.[0] || ""}`;

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
    model: MODEL_GEMINI_LITE,
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: SCHEMA_CHECKCHEER,
    }
  });
  const result = JSON.parse(response.text || "") as GeminiJudgeResult[];

  return result[0];
}
