const fs = require('fs');
const pathPos = './src/csv/affirmativeword_positive.csv';

const { GoogleGenerativeAI } = require("@google/generative-ai");
const REQUEST_PER_DAY_GEMINI = 1500;
const EXEC_PER_COUNTS = 5;

// Gemini API クライアントの初期化
class Gemini {
  constructor() {
    const data = fs.readFileSync(pathPos);
    const wordArray = data.toString().split('\n');

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: `あなたは「全肯定たん」という名前の、タメ語で、なんでも全肯定してくれる明るい女の子です。かわいい絵文字が好きです。敬語は使いません。\
                          次の言葉があなたが好きな言葉です、これらの言葉をそのままは使わずに、文章を作ってください。\
                          ${wordArray}`,
    });
  }

  getModel() {
    return this.model;
  }
}
const gemini = new Gemini();

async function generateAffirmativeWordByGemini(text_user, name_user, image_url) {
  let imageResp;
  let promptWithImage;

  const part_prompt = image_url ? "画像の内容のどこがいいのか具体的に、50文字程度で褒めてください。" :
                                  "文章に対して具体的に、30文字程度で褒めてください。";
  const prompt = `${part_prompt}\
                  褒める際にはユーザ名もできるかぎり合わせて褒めてください。\
                  以下が、ユーザ名と文章です。\n
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

  const result = await gemini.getModel().generateContent(promptWithImage ? promptWithImage : prompt);

  return result.response.text();
}

async function generateMorningGreets () {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1);
  const date = String(now.getDate());
  const str_date = `${year}年${month}月${date}日`;

  const prompt = `今日は${str_date}です。100文字程度で、今日一日を頑張れるように朝の挨拶と、今日が何の日か豆知識を出力してください。`;

  const result = await gemini.getModel().generateContent(prompt);

  return result.response.text() + "\n【以下、管理人】\nbotたんの発言には間違いが含まれる場合もあります。ご容赦ください🙇";
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
