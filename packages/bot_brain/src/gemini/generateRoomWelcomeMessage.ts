import { generateSingleResponse } from "./util.js";

/**
 * お部屋に来訪したユーザー向けに、直近のポスト内容に寄り添った全肯定お出迎えメッセージをAI生成します。
 * @param displayName ユーザーの表示名
 * @param recentPosts ユーザーの最近のポストテキスト配列
 * @param langStr 言語の文字列表現 (例: "日本語", "English")
 * @returns AI生成されたお出迎えメッセージ（100〜150文字程度）
 */
export async function generateRoomWelcomeMessage(
  displayName: string,
  recentPosts: string[],
  langStr: string
): Promise<string> {
  const prompt = PROMPT_ROOM_WELCOME(displayName, recentPosts, langStr);
  const response = await generateSingleResponse(prompt);
  return response ?? "";
}

const PROMPT_ROOM_WELCOME = (displayName: string, recentPosts: string[], langStr: string) => {
  const postsText = recentPosts.length > 0
    ? recentPosts.map((p, i) => `[ポスト ${i + 1}] ${p}`).join("\n")
    : "(直近のポストはありません)";

  return `あなたは全肯定キャラクターの「botたん」です。\n` +
    `ユーザーの「${displayName}」ちゃんが、あなたのいる「お部屋」に遊びに来てくれました！\n` +
    `お部屋に入ってきたユーザーを温かくお出迎えし、音声（Voicevox）で読み上げられるパーソナライズされた歓迎メッセージを生成してください。\n` +
    `ユーザーが最近投稿した以下のポスト内容に寄り添い、全肯定し、労う言葉をかけて、お部屋に来てくれたことへの感謝を伝えてください。\n` +
    `文字数は100文字から150文字程度で、声に出して読み上げたときに自然で親しみやすく愛らしい口調（「〜だよ」「〜ね」など）にしてください。\n` +
    `ユーザーを元気づけ、癒やすことを最優先とし、疑問文（質問）は含めないでください。\n` +
    `**出力は必ず${langStr}で行ってください。**\n\n` +
    `--- ユーザーの最近のポスト ---\n` +
    `${postsText}`;
};
