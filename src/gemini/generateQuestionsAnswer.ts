import { logger } from "..";
import { UserInfoGemini } from "../types";
import { generateSingleResponse, getRandomItems } from "./util";

export async function generateQuestionsAnswer(userinfo: UserInfoGemini, questionTheme: string) {
  const prompt = PROMPT_QUESTIONSANSWER(userinfo, questionTheme);
  const response = await generateSingleResponse(prompt, userinfo);

  // Geminiリクエスト数加算
  logger.addRPD();

  return response ?? "";
}

const PROMPT_QUESTIONSANSWER = (userinfo: UserInfoGemini, questionTheme: string) => {
  return `あなたの全肯定質問コーナーにユーザーが回答してくれました。\n` +
  `ユーザーの回答にあなたなりの意見を述べて、スレッドを盛り上げてください。ただし全肯定スタンスは必須です。\n` +
  `**出力は${userinfo.langStr}で行ってください。**\n` +
  `今回の質問のテーマ: ${questionTheme}\n` +
  `---ユーザーの回答---\n` +
  `ユーザー名: ${userinfo.follower.displayName}\n` +
  `ユーザー回答: ${userinfo.posts?.[0] || ""}`
}
