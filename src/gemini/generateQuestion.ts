import { get } from "http";
import { logger } from "..";
import { UserInfoGemini } from "../types";
import { generateSingleResponse, getRandomItems } from "./util";
import { readFileSync } from 'fs';

export async function generateQuestion() {
  const theme = `${getRandomItems(theme_adj_0, 1)}${getRandomItems(theme_adj_1, 1)}${getRandomItems(theme_noun, 1)}`;
  const prompt = PROMPT_QUESTION(theme);
  const response = await generateSingleResponse(prompt);

  // Geminiリクエスト数加算
  logger.addRPD();

  return {
    text: response.text ?? "",
    theme,
  }
} 

const PROMPT_QUESTION = (questionTheme: string) => {
  return `朝の挨拶と、全肯定質問コーナーの時間です。\n` +
  `フォロワーに質問を投げかけてください。\n` +
  `今回の質問のテーマは「${questionTheme}」です。\n` +
  `質問に回答してくれたフォロワーには先着限定で、あなたからリプライすることを伝えてください。\n` +
  `ルール:\n` +
  `* 出力は、日本語とその英語訳を記載してください。\n` +
  `* 出力の最後にはハッシュタグ「#全肯定質問コーナー」と「#BottansQuestion」をつけてください。`
}

const theme_adj_0 = ["好きな", "意外と好きな", "尊敬する", "推しの", "懐かしい"];
const theme_adj_1 = ["母国の", "外国の", "アニメ漫画の", "ゲームの", "映画の", "Blueskyの"];
const theme_noun = ["食べ物・料理", "場所・風景", "動物・ペット", "歌手・音楽", "歴史・文化", "キャラクター", "友達"];
