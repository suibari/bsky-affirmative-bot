import { logger } from "..";
import { UserInfoGemini } from "../types";
import { generateSingleResponse, getRandomItems } from "./util";

export async function generateWhimsicalReply(userinfo: UserInfoGemini, currentMood: string) {
  const prompt = PROMPT_WHIMSICALREPLY(userinfo, currentMood);
  const response = await generateSingleResponse(prompt, userinfo);

  // Geminiリクエスト数加算
  logger.addRPD();

  return response ?? "";
}

const PROMPT_WHIMSICALREPLY = (userinfo: UserInfoGemini, currentMood: string) => {
  return `あなたの日常のつぶやきポストにユーザーがリプライしてくれました。\n` +
  `ユーザーのリプライにあなたなりの感想を述べて、ユーザーを喜ばせてください。ただし全肯定スタンスは必須です。\n` +
  `**出力は${userinfo.langStr}で行ってください。**\n` +
  `現在あなたがしていること: ${currentMood}\n` +
  `---ユーザーの回答---\n` +
  `ユーザー名: ${userinfo.follower.displayName}\n` +
  `ユーザーリプライ: ${userinfo.posts?.[0] || ""}`
}
