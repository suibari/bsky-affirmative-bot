const { GoogleGenerativeAI } = require("@google/generative-ai");
const REQUEST_PER_DAY_GEMINI = 1500;
const EXEC_PER_COUNTS = 15;

// Gemini API クライアントの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash",
  systemInstruction: "あなたは「全肯定たん」という名前の、6歳くらいの女児です。入力された文章に対して、100文字以内で簡潔に褒めてください。",
});
const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 100,
  responseMimeType: "text/plain",
};

async function generateAffirmativeWordByGemini(text_user) {
  const prompt = text_user;
  const result = await model.generateContent(prompt);

  return result.response.text();
}

class RequestPerDayGemini {
  constructor() {
    this.rpd = 0;
    this.count = 0;
    this.lastResetDay = new Date().getDate(); // 最後に初期化した日を記録
  }

  init() {
    this.rpd = 0;
    this.count = 0;
    this.lastResetDay = new Date().getDate(); // 初期化したタイミングの日付
  }

  add() {
    this.resetIfNeeded(); // 日付が変わっていれば初期化
    if (this.rpd < REQUEST_PER_DAY_GEMINI) {
      this.rpd++;
    }
  }

  checkMod() {
    this.resetIfNeeded(); // 日付が変わっていれば初期化
    const result = (this.count % EXEC_PER_COUNTS === 0) && (this.rpd < REQUEST_PER_DAY_GEMINI);
    this.count++;

    return result;
  }

  resetIfNeeded() {
    const currentDay = new Date().getDate(); // 現在の日
    if (currentDay !== this.lastResetDay) {
      this.init(); // 日付が変わっていたら初期化
    }
  }
}

module.exports.generateAffirmativeWordByGemini = generateAffirmativeWordByGemini;
module.exports.RequestPerDayGemini = RequestPerDayGemini;
