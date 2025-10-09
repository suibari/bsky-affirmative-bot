import { PartListUnion, Type } from "@google/genai";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "../config/index.js";
import { gemini } from "./index.js";
import { logger } from "../index.js";
import { getFullDateAndTimeString } from "./util.js";
import { LanguageName } from "../types.js";

type GeminiRecommendation = [
  {
    title: string;
    artist: string;
    comment: string;
  }
]

export async function generateMyMoodSong(currentMood: string, langStr: LanguageName) {
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

  const prompt = PROMPT_DJ(currentMood, langStr);
  const contents: PartListUnion = prompt;
  const response = await gemini.models.generateContent({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: SCHEMA_DJBOT,
      tools: [
        {
          googleSearch: {},
        }
      ]
    }
  });
  const result = JSON.parse(response.text || "") as GeminiRecommendation;

  // Geminiリクエスト数加算
  logger.addRPD();

  return result[0];
}

const PROMPT_DJ = (currentMood: string, langStr: LanguageName) => {
return `あなたの今の気分と現在の時間にあった曲を選曲してください。
# ルール
* 実在しない曲は挙げてはいけません。
* ${langStr}の曲を挙げてください。
* titleに曲名、artistにアーティスト名を、正確に出力してください
* commentには選曲に関するあなたのコメントを出力してください
-----
現在の時間: ${getFullDateAndTimeString()}
今の気分: ${currentMood}
`};
