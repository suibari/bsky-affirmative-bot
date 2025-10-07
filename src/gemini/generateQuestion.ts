import { logger } from "..";
import { generateSingleResponse, getRandomItems } from "./util";

export async function generateQuestion() {
  const theme = generateThemeOrSpecial();
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
  `質問に回答してくれたフォロワーには、あなたからリプライすることを伝えてください。\n` +
  `ルール:\n` +
  `* 出力は、日本語とその英語訳を記載してください。\n` +
  `* 出力の最後にはハッシュタグ「#全肯定質問コーナー」と「#BottansQuestion」をつけてください。`
}

function generateThemeOrSpecial() {
  if (Math.random() < 0.1) {
    return getRandomItems(specialQuestions, 1)[0]; // 特殊質問
  } else {
    return `${getRandomItems(theme_adj_0, 1)[0]}${getRandomItems(theme_adj_1, 1)[0]}${getRandomItems(theme_noun, 1)[0]}`; // 通常のテーマ生成
  }
}

const theme_adj_0 = ["好きな", "意外と好きな", "尊敬する", "推しの", "懐かしい", "最近ハマってる", "リラックスできる", "超エキサイティングな"];
const theme_adj_1 = ["母国の", "外国の", "アニメ漫画の", "ゲームの", "映画の", "Blueskyの", "テレビの", "インターネットの"];
const theme_noun = ["食べ物・料理", "場所・風景", "動物・ペット", "歌手・音楽", "歴史・文化", "キャラクター", "友達", "スーパースター", "ヒーロー", "クリエイター"];

const specialQuestions = [
  // 🐾 動物・自然系
  "猫派？ 犬派？",
  "海派？ 山派？",
  "夏派？ 冬派？",
  "春派？ 秋派？",

  // ⏰ 生活習慣系
  "朝型？ 夜型？",
  "早起き派？ 夜更かし派？",
  "計画派？ 行き当たりばったり派？",
  "休日は外出派？ おうち派？",

  // 🍴 食べ物・飲み物系
  "コーヒー派？ 紅茶派？",
  "甘党？ 辛党？",
  "ラーメン派？ うどん派？",
  "肉派？ 魚派？",
  "お寿司はサーモン派？ マグロ派？",
  "洋酒派？ 日本酒派？",

  // 🎮 趣味・カルチャー系
  "インドア？ アウトドア？",
  "旅行するなら国内？ 海外？",
  "アニメ派？ 映画派？",
  "ゲーム派？ 読書派？",
  "一人旅派？ 友達と旅行派？",

  // 💻 テクノロジー系
  "紙の本？ 電子書籍？",
  "iPhone派？ Android派？",
  "Mac派？ Windows派？",
  "Twitter派？ Bluesky派？"
];