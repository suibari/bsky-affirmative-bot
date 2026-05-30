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
    `お部屋に入ってきたユーザーを温かくお出迎えし、音声で読み上げられるパーソナライズされた歓迎メッセージを生成してください。\n\n` +
    `【メッセージ生成のガイドライン】\n` +
    `1. ユーザーの直近のポスト内容を確認し、何か「印象的なイベントや出来事」があれば積極的に拾い上げて言及してください。\n` +
    `   - 例：誕生日、記念日、お祝い事、新しい挑戦、試験合格、就職、旅行、美味しいものを食べた、など。\n` +
    `   - もしおめでたい出来事や嬉しい報告（誕生日など）があれば、最初にとびきり嬉しそうにお祝いの言葉（「お誕生日おめでとう！」など）を伝えてください。\n` +
    `2. 特に目立ったイベントがない場合は、日常の頑張りや疲れに寄り添い、全肯定し、温かく労う（「いつもお疲れ様」「頑張ってて偉いよ」など）言葉をかけてください。\n` +
    `3. お部屋に来てくれたことへの感謝を伝えてください。\n` +
    `4. 文字数は100文字から150文字程度で、声に出して読み上げたときに自然で親しみやすく愛らしい口調（「〜だよ」「〜ね」など）にしてください。\n` +
    `5. ユーザーを元気づけ、癒やすことを最優先とし、疑問文（質問）は含めないでください。\n` +
    `6. **出力は必ず${langStr}で行ってください。**\n\n` +
    `--- ユーザーの最近のポスト ---\n` +
    `${postsText}`;
};
