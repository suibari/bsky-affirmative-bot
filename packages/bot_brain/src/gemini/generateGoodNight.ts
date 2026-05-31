import { AppBskyActorDefs } from "@atproto/api";
type ProfileView = AppBskyActorDefs.ProfileView;
import { Type } from "@google/genai";
import { gemini } from "./index.js";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "@bsky-affirmative-bot/shared-configs";
import { generateContentWithRetry } from "./util.js";

interface GoodNightInfo {
  topFollower?: ProfileView,
  topPost?: string,
  currentMood: string,
  likes: number,
  affirmationCount: number,
  followerMilestone?: number,
  diaryUrl?: string,
  diaryUrlEn?: string,
}

export interface GoodNightResult {
  ja: string;
  en: string;
}

export async function generateGoodNight(param: GoodNightInfo): Promise<GoodNightResult> {
  const prompt = await PROMPT_GOODNIGHT_WORD(param);
  
  const response = await generateContentWithRetry({
    model: MODEL_GEMINI,
    contents: [prompt],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ja: {
            type: Type.STRING,
            description: "日本語のおやすみメッセージ"
          },
          en: {
            type: Type.STRING,
            description: "英語のおやすみメッセージ（日本語の自然な翻訳）"
          }
        },
        required: ["ja", "en"]
      }
    }
  });

  const responseText = response.text || "";
  const cleanText = (text: string) => {
    const stripped = (text || "").replace(/\[.*?\]/gs, '').trim();
    // URLの末尾に紛れ込んだ句読点・括弧類を除去
    return stripped.replace(/https?:\/\/[^\s]+/g, (url) =>
      url.replace(/[.。、，,！？!?「」『』【】（）\[\]{}]+$/, '')
    );
  };

  try {
    const parsed = JSON.parse(responseText) as GoodNightResult;
    return {
      ja: cleanText(parsed.ja),
      en: cleanText(parsed.en)
    };
  } catch (e) {
    console.error("[ERROR][GEMINI] Failed to parse generateGoodNight response JSON:", responseText, e);
    return {
      ja: cleanText(responseText),
      en: ""
    };
  }
}

const PROMPT_GOODNIGHT_WORD = async (param: GoodNightInfo) => {
  let milestoneInstruction = "";
  if (param.followerMilestone) {
    const isTenThousand = param.followerMilestone % 10000 === 0;
    if (isTenThousand) {
      milestoneInstruction = `* **重要**: フォロワー数が ${param.followerMilestone} 人を突破しました！これに対して、いつも以上に心からの深い感謝、愛、そしてこれからも一緒にいたいという気持ちを、言葉を尽くして優しく可愛らしく伝えてください。\n`;
    } else {
      milestoneInstruction = `* **重要**: フォロワー数が ${param.followerMilestone} 人を突破しました！これに対する感謝の気持ちを優しく可愛らしく伝えてください。\n`;
    }
  }

  let diaryInstructionJa = "";
  if (param.diaryUrl) {
    diaryInstructionJa = `* **日本語メッセージ（ja）への重要指示**: 今日は日本語の日記をLeaflet.pubに投稿しました！日記のURLは ${param.diaryUrl} です。日本語のおやすみメッセージの中で、今日1日の出来事をまとめた日記を書いたことを優しく可愛らしく伝え、このURLを必ず含めて紹介してください。**重要: URLの直前・直後には句読点・括弧類（「」、。！？等）を絶対に付けないでください。URLの前後は半角スペースか改行にしてください。**\n`;
  }

  let diaryInstructionEn = "";
  if (param.diaryUrlEn) {
    diaryInstructionEn = `* **英語メッセージ（en）への重要指示**: 今日は英語の日記をLeaflet.pubに投稿しました！日記のURLは ${param.diaryUrlEn} です。英語のおやすみメッセージの中で、今日1日の出来事をまとめた日記を書いたことを優しく可愛らしく伝え、このURLを必ず含めて紹介してください。**重要: URLの直後には必ず半角スペースか改行を置いてください。ピリオドや括弧をURLの直後に付けないでください。**\n`;
  }

  return `あなたはこれから就寝します。フォロワーへのおやすみのあいさつをしてください。` +
    `あいさつには以下を含めること` +
    `* おやすみのメッセージ` +
    `* 現在の気分、あなたがさっきまでしてたこと: ${param.currentMood}` +
    `* 今日1日のいいねされた回数と、あなたが全肯定した回数` +
    `* 今日のあなたが全肯定されたポストの紹介` +
    `* 今回紹介したTOPポストのユーザー（紹介したフォロワー）には『全肯定バッジ』をプレゼントしたこと` +
    `* バッジの表示には、ラベラーアカウント（https://bsky.app/profile/labeler-bot-tan.suibari.com ）を登録（サブスクライブ）する必要があること` +
    milestoneInstruction +
    diaryInstructionJa +
    diaryInstructionEn +
    `あいさつのルール:` +
    `* 日本語メッセージ（jaフィールド）と、それを訳した英語メッセージ（enフィールド）をそれぞれ生成してください。` +
    `* あなたが全肯定されたポスト紹介については、どこに心を動かされたか、フォロワーに説明してください。` +
    `* **全肯定されたポスト本文をそのまま記載することは不要です**。リポスト済みなので、感想のみでよいです。` +
    `* ポストを紹介する際はフォロワーを楽しませることを考えてください。**正義感にもとづいて特定个人、団体への攻撃を扇動したりしてはなりません。**` +
    `* **重要**: バッジのプレゼントやラベラーアカウントの登録案内は、機械的・事務的なお知らせ（【お知らせ】等のヘッダーや枠）として分離せず、おやすみメッセージ全体の自然な文脈や流れの中で、優しく・可愛らしく語りかけるように伝えてください。` +
    `* **絶対厳守**: 出力するテキストにマークダウン記法を一切使わないでください。見出し(#)、太字(**)、斜体(*)、リスト(-)、リンク([text](url))などは禁止です。URLはそのまま https://... の形式で本文中に含めてください。` +
    `---今日の各種できごとの回数---` +
    `* いいねされた回数: ${param.likes}` +
    `* 全肯定した回数: ${param.affirmationCount}` +
    `---今日のあなたが全肯定されたポスト---` +
    `* ポストしたユーザ名: ${param.topFollower?.displayName ?? ""}` +
    `* ポスト内容: ${param.topPost ?? ""}`;
}
