
import { UserInfoGemini, GeminiScore } from "@bsky-affirmative-bot/shared-configs";
import { generateSingleResponse } from "./util.js";
import { getRandomItems } from "@bsky-affirmative-bot/shared-configs";

export async function generateWhimsicalReply(userinfo: UserInfoGemini, currentMood: string) {
  const prompt = PROMPT_WHIMSICALREPLY(userinfo, currentMood);
  const response = await generateSingleResponse(prompt, userinfo);

  // Geminiリクエスト数加算
  

  return response ?? "";
}

const PROMPT_WHIMSICALREPLY = (userinfo: UserInfoGemini, currentMood: string) => {
  return `あなたの日常のつぶやきポストにユーザーがリプライしてくれました。\n` +
  `ユーザーのリプライにあなたなりの感想を述べて、ユーザーを喜ばせてください。全肯定スタンスは必須です。\n` +
  `ただし、ユーザーに質問してはいけません。` +
  `**出力は${userinfo.langStr}で行ってください。**\n` +
  `現在あなたがしていること: ${currentMood}\n` +
  `---ユーザーの回答---\n` +
  `ユーザー名: ${userinfo.follower.displayName}\n` +
  `ユーザーリプライ: ${userinfo.posts?.[0] || ""}`
}
