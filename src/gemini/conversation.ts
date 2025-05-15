import { PartListUnion } from "@google/genai";
import { gemini } from "./index.js";
import { MODEL_GEMINI, PROMPT_CONVERSATION, SYSTEM_INSTRUCTION } from "../config/index.js";
import { UserInfoGemini } from "../types.js";

export async function conversation(userinfo: UserInfoGemini) {
  const prompt = PROMPT_CONVERSATION(userinfo);
  const chat = gemini.chats.create({
    model: MODEL_GEMINI,
    history: userinfo.history || undefined,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    }
  })
 
  // message作成
  const message: PartListUnion = [prompt];
  if (userinfo.image_url && userinfo.image_mimeType) {
    const response = await fetch(userinfo.image_url);
    const imageArrayBuffer = await response.arrayBuffer();
    const base64ImageData = Buffer.from(imageArrayBuffer).toString("base64");
    message.push({
      inlineData: {
        mimeType: userinfo.image_mimeType,
        data: base64ImageData,
      }
    });
  }
  const response = await chat.sendMessage({message});

  const new_history = chat.getHistory();
  const text_bot = response.text;

  return {text_bot, new_history};
}
