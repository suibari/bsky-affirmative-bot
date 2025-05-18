import { PartListUnion, Type } from "@google/genai";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "../config/index.js";
import { GeminiRecommendation, GeminiSchemaRecommendedSong, UserInfoGemini } from "../types.js";
import { gemini } from "./index.js";

export async function generateRecommendedSong(userinfo: UserInfoGemini) {
  const part_language = `${userinfo.langStr === "日本語" ? "日本語" : "英語"}で回答は生成してください。`;
  const SCHEMA_DJBOT: GeminiSchemaRecommendedSong = {
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

  const prompt = PROMPT_DJ(userinfo);
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
  const result = JSON.parse(response.text || "") as GeminiRecommendation;

  return result[0];
}

const PROMPT_DJ = (userinfo: UserInfoGemini) => {
  return userinfo.langStr === "日本語" ?
`以下のユーザが流す曲をリクエストしています。
ユーザの指定する雰囲気に合った曲を選曲してあげてください。
アニメやゲームのネタがあった場合、それにあった曲を選曲してあげてください。
実在しない曲は挙げてはいけません。
-----この下がユーザからのメッセージです-----
ユーザ名: ${userinfo.follower.displayName}
文章: ${userinfo.posts?.[0] || ""}
` :
`The following user is requesting a song.
Please select a song that matches the atmosphere the user specifies.
If the user mentions any anime or game references, please choose a song related to those.
Do not suggest any songs that do not actually exist.  
The output should be in ${userinfo.langStr}.
-----Below is the user's message-----  
Username: ${userinfo.follower.displayName}  
Message: ${userinfo.posts?.[0] || ""}
`};
