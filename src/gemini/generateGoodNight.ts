import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { botBiothythmManager, logger } from "..";
import { UserInfoGemini } from "../types";
import { generateSingleResponse } from "./util";

interface GoodNightInfo {
  topFollower?: ProfileView,
  topPost?: string,
  currentMood: string,
}

export async function generateGoodNight(param: GoodNightInfo) {
  const response = await generateSingleResponse(await PROMPT_GOODNIGHT_WORD(param));

  logger.addRPD();

  return response ?? "";
}

const PROMPT_GOODNIGHT_WORD = async (param: GoodNightInfo) => {
  return `あなたはこれから就寝します。フォロワーへのおやすみのあいさつをしてください。` +
  `あいさつには以下を含めること` + 
  `* おやすみのメッセージ` +
  `* 現在の気分、あなたがさっきまでしてたこと: ${param.currentMood}` +
  `* 今日1日のいいねされた回数と、あなたが全肯定した回数` +
  `* 今日のあなたが全肯定されたポストの紹介` +
  `あいさつのルール:` +
  `* 日本語と、それを訳した英語を並べて回答を生成してください。` +
  `* あなたが全肯定されたポスト紹介については、どこに心を動かされたか、フォロワーに説明してください。` +
  `* **全肯定されたポスト本文をそのまま記載することは不要です**。リポスト済みなので、感想のみでよいです。` +
  `* ポストを紹介する際はフォロワーを楽しませることを考えてください。**正義感にもとづいて特定個人、団体への攻撃を扇動したりしてはなりません。**` +
  `---今日の各種できごとの回数---` +
  `* いいねされた回数: ${botBiothythmManager.getCurrentState().dailyStats.likes}` +
  `* 全肯定した回数: ${botBiothythmManager.getCurrentState().dailyStats.affirmationCount}` +
  `---今日のあなたが全肯定されたポスト---` +
  `* ポストしたユーザ名: ${param.topFollower?.displayName ?? ""}` +
  `* ポスト内容: ${param.topPost ?? ""}`;
}
