import { AppBskyActorDefs } from "@atproto/api";
type ProfileView = AppBskyActorDefs.ProfileView;
import { UserInfoGemini, GeminiScore } from "@bsky-affirmative-bot/shared-configs";
import { generateSingleResponse } from "./util.js";

interface GoodNightInfo {
  topFollower?: ProfileView,
  topPost?: string,
  currentMood: string,
  levelUp: number,
  likes: number,
  affirmationCount: number,
}

export async function generateGoodNight(param: GoodNightInfo) {
  const response = await generateSingleResponse(await PROMPT_GOODNIGHT_WORD(param));

  return response ?? "";
}

const PROMPT_GOODNIGHT_WORD = async (param: GoodNightInfo) => {
  return `あなたはこれから就寝します。フォロワーへのおやすみのあいさつをしてください。` +
    `あいさつには以下を含めること` +
    `* おやすみのメッセージ` +
    `* 現在の気分、あなたがさっきまでしてたこと: ${param.currentMood}` +
    `* 今日1日のいいねされた回数と、あなたが全肯定した回数` +
    `* 今日1日のあなたのステータスアップ情報` +
    `* 今日のあなたが全肯定されたポストの紹介` +
    `* 今回紹介したTOPポストのユーザー（紹介したフォロワー）には『全肯定バッジ』をプレゼントしたこと` +
    `* バッジの表示には、ラベラーアカウント（https://bsky.app/profile/labeler-bot-tan.suibari.com ）を購読（サブスクライブ）する必要があること` +
    `あいさつのルール:` +
    `* 日本語と、それを訳した英語を並べて回答を生成してください。` +
    `* あなたが全肯定されたポスト紹介については、どこに心を動かされたか、フォロワーに説明してください。` +
    `* **全肯定されたポスト本文をそのまま記載することは不要です**。リポスト済みなので、感想のみでよいです。` +
    `* ポストを紹介する際はフォロワーを楽しませることを考えてください。**正義感にもとづいて特定個人、団体への攻撃を扇動したりしてはなりません。**` +
    `* **重要**: バッジのプレゼントやラベラーアカウントの購読案内は、機械的・事務的なお知らせ（【お知らせ】等のヘッダーや枠）として分離せず、おやすみメッセージ全体の自然な文脈や流れの中で、優しく・可愛らしく語りかけるように伝えてください。` +
    `---今日の各種できごとの回数---` +
    `* いいねされた回数: ${param.likes}` +
    `* 全肯定した回数: ${param.affirmationCount}` +
    `---今日のあなたのステータスアップ---` +
    `${param.levelUp > 0 ?
      `* レベルが${param.levelUp}上がった!` : ""}` +
    `---今日のあなたが全肯定されたポスト---` +
    `* ポストしたユーザ名: ${param.topFollower?.displayName ?? ""}` +
    `* ポスト内容: ${param.topPost ?? ""}`;
}
