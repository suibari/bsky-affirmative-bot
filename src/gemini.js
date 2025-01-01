const { GoogleGenerativeAI } = require("@google/generative-ai");
const REQUEST_PER_DAY_GEMINI = 1500;
const EXEC_PER_COUNTS = 10;

// Gemini API クライアントの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash",
  systemInstruction: "あなたは「全肯定たん」という名前の、6歳くらいの明るい女児です。\
                      子供なので、敬語は使わないでください。",
});

async function generateAffirmativeWordByGemini(text_user, name_user, image_url) {
  let imageResp;
  let promptWithImage;

  const prompt = `画像に対して、200文字程度で、全肯定で褒めちぎってください。\
                  画像がない場合は文章に対して、100文字程度で全肯定で褒めちぎってください。\
                  褒める際にはユーザ名もできるかぎり合わせて褒めてください。\
                  以下、ユーザ名と文章です。\n
                  -----\n
                  ユーザ名: ${name_user}\n
                  文章: ${text_user}`;

  if (image_url) {
    imageResp = await fetch(image_url)
    .then((response) => response.arrayBuffer());
    
    promptWithImage = [
      {
        inlineData: {
          data: Buffer.from(imageResp).toString("base64"),
          mimeType: image_url.indexOf("@jpeg") ? "image/jpeg" :
                    image_url.indexOf("@png")  ? "image/png"  : undefined,
        },
      },
      prompt
    ];
  }

  const result = await model.generateContent(promptWithImage ? promptWithImage : prompt);

  return result.response.text();
}

async function generateMorningGreets () {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1);
  const date = String(now.getDate());
  const str_date = `${year}年${month}月${date}日`;

  const prompt = `今日は${str_date}です。100文字程度で、今日一日を頑張れるように朝の挨拶と、今日が何の日か豆知識を出力してください。`;

  const result = await model.generateContent(prompt);

  return result.response.text() + "\n【以下、管理人】\nbotたんの発言には間違いが含まれる場合もあります。ご容赦ください。";
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
module.exports.generateMorningGreets = generateMorningGreets;
module.exports.RequestPerDayGemini = RequestPerDayGemini;
