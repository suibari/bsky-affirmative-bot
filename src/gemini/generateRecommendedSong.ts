import { PartListUnion, Type } from "@google/genai";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "../config/index.js";
import { UserInfoGemini } from "../types.js";
import { gemini } from "./index.js";

export async function generateRecommendedSong(userinfo: UserInfoGemini) {
  const SCHEMA_DJBOT = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
        },
        artist: {
          type: Type.STRING,
        },
        comment: {
          type: Type.STRING,
        }
      },
      propertyOrdering: ["title", "artist", "comment"],
    }
  }

  const prompt = 
`
以下のユーザが流す曲をリクエストしています。
ユーザの指定する雰囲気に合った曲を選曲してあげてください。
-----この下がユーザからのメッセージです-----
ユーザ名: ${userinfo.follower.displayName}
文章: ${userinfo.posts?.[0] || ""}`;

  const contents: PartListUnion = prompt;
  const response = await gemini.models.generateContent({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: SCHEMA_DJBOT,
    }
  });

  return response.text ?? "";
}
