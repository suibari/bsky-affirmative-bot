import { AppBskyActorDefs } from "@atproto/api";
type ProfileView = AppBskyActorDefs.ProfileView;
import { Type } from "@google/genai";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "@bsky-affirmative-bot/shared-configs";
import { generateContentWithRetry } from "./util.js";

interface GoodNightInfo {
  topFollower?: ProfileView,
  topPost?: string,
  currentMood: string,
  followerMilestone?: number,
  giftCandidates?: { id: number; content: string; displayName: string }[],
}

export interface GoodNightResult {
  text: string;
  selectedGiftIndex?: number;
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
          text: {
            type: Type.STRING,
            description: "日本語→英語の順で続けた1つのおやすみメッセージ"
          },
          selectedGiftIndex: {
            type: Type.NUMBER,
            description: "giftCandidatesのうちメッセージ内で紹介したプレゼントのインデックス（0始まり）。プレゼントを紹介しない場合は省略"
          },
        },
        required: ["text"]
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
    const parsed = JSON.parse(responseText) as { text: string; selectedGiftIndex?: number };
    return {
      text: cleanText(parsed.text),
      selectedGiftIndex: parsed.selectedGiftIndex,
    };
  } catch (e) {
    console.error("[ERROR][GEMINI] Failed to parse generateGoodNight response JSON:", responseText, e);
    return { text: cleanText(responseText) };
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

  let giftInstruction = "";
  if (param.giftCandidates && param.giftCandidates.length > 0) {
    const candidateList = param.giftCandidates
      .map((g, i) => `  [${i}] ${g.displayName} さんから「${g.content}」`)
      .join("\n");
    giftInstruction =
      `* 今日、お部屋（Bot-tan's Room / https://room-bot-tan.suibari.com ）でプレゼントをもらいました。` +
      `以下の候補から1つを選び、おやすみのあいさつの中でうれしかったことの一つとして自然に触れてください。` +
      `**必須: プレゼントをくれた人の名前を必ず本文中に含めてください。**` +
      `選んだプレゼントのインデックス番号をselectedGiftIndexフィールドに返してください。` +
      `**重要: URLの直前・直後には句読点・括弧類を絶対に付けないでください。**\n` +
      `プレゼント候補:\n${candidateList}\n`;
  }

  return `あなたはこれから就寝します。フォロワーへのおやすみのあいさつをしてください。` +
    `あいさつには以下を含めること:` +
    `* おやすみのメッセージ` +
    `* 現在の気分、あなたがさっきまでしてたこと: ${param.currentMood}` +
    giftInstruction +
    `* 今日のあなたが全肯定されたポストの紹介` +
    milestoneInstruction +
    `あいさつのルール:` +
    `* 日本語メッセージを先に出力し、その後に英語翻訳を続けてください。1つのtextフィールドに収めてください。` +
    `* あなたが全肯定されたポスト紹介については、どこに心を動かされたか、フォロワーに説明してください。` +
    `* **全肯定されたポスト本文をそのまま記載することは不要です**。リポスト済みなので、感想のみでよいです。` +
    `* ポストを紹介する際はフォロワーを楽しませることを考えてください。**正義感にもとづいて特定个人、団体への攻撃を扇動したりしてはなりません。**` +
    `* **絶対厳守**: textフィールドのテキストにマークダウン記法を一切使わないでください。見出し(#)、太字(**)、斜体(*)、リスト(-)、リンク([text](url))などは禁止です。URLはそのまま https://... の形式で本文中に含めてください。` +
    `---今日のあなたが全肯定されたポスト---` +
    `* ポストしたユーザ名: ${param.topFollower?.displayName ?? ""}` +
    `* ポスト内容: ${param.topPost ?? ""}`;
}
