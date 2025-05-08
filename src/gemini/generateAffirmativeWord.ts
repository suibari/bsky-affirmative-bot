import { createPartFromUri, PartListUnion } from "@google/genai";
import { gemini } from "./index.js";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "../config/index.js";
import { UserInfoGemini } from "../types.js";

export async function generateAffirmativeWord(userinfo: UserInfoGemini) {
  const part_prompt_main = userinfo.image_url ? `ユーザの画像の内容について、200文字までで褒めてください。画像の内容について具体的に言及して褒めるようにしてください。` :
                                                `ユーザからの文章に対して具体的に、100文字までで褒めてください。`;
  const part_prompt_lang = userinfo.langStr ? `${userinfo.langStr}で褒めてください。` :
                                              `褒める際の言語は、ユーザの文章の言語に合わせてください。`;
  const prompt = 
`
${part_prompt_main}
${part_prompt_lang}
-----この下がユーザからのメッセージです-----
ユーザ名: ${userinfo.follower.displayName}
文章: ${userinfo.posts?.[0] || ""}`;

  const contents: PartListUnion = [prompt];
  if (userinfo.image_url && userinfo.image_mimeType) {
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
  })
  
  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  const result = response.text?.split("-----")[0];

  return result ?? "";
}
