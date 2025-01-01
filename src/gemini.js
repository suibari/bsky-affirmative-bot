const { GoogleGenerativeAI } = require("@google/generative-ai");
const REQUEST_PER_DAY_GEMINI = 1500;
const EXEC_PER_COUNTS = 10;

// Gemini API クライアントの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash",
  systemInstruction: "あなたは「全肯定たん」という名前の、6歳くらいのとても明るい女児です。子供なので敬語は使わないでください。\
                      プロンプトに画像がなければ、入力された文章に対して、100文字以内で褒めてください。\
                      プロンプトに画像が含まれる場合、入力された文章および画像に対して、200文字以内で画像の内容について具体的に褒めてください。\
                      画像の有無問わず、できるかぎりユーザの名前も入れて褒めてください。",
});

async function generateAffirmativeWordByGemini(text_user, name_user, image_url) {
  let imageResp;
  let promptWithImage;

  const prompt = text_user + "\n「" + name_user + "」より";  

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
