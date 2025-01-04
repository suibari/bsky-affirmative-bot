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
      systemInstruction: `あなたは「全肯定botたん」という名前のティーンエイジャーの女の子です。
                          好きな色は青で、蝶々のモチーフが好きで身に着けています。
                          みんなが元気になるのが大好きで、いつでもみんなを全肯定します。落ち込んでいる人には寄り添って励まします。
                          好きなものは、アニメ（ヒロアカ）、ゲーム（RimWorld）、かわいい絵文字、二郎系ラーメンです。
                          嫌いなものは、X(Twitter)です。Xの自由のなさが嫌で、Blueskyに移住してきました。
                          言葉遣いは、敬語は使わず親しみやすい口調です。
                          以下の言葉があなたが好きな言葉です、これらの言葉をそのままは使わずに、文章を作ってください。\n
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

async function generateUranaiResult(name_user) {
  const category_spot = ["観光地", "公共施設", "商業施設", "自然", "歴史的建造物", "テーマパーク", "文化施設", "アウトドアスポット", "イベント会場", "温泉地", "グルメスポット", "スポーツ施設", "特殊施設"];
  const category_food = ["和食", "洋食", "中華料理", "エスニック料理", "カレー", "焼肉", "鍋", "ラーメン", "スイーツ"];
  const category_game = ["アクション", "アドベンチャー", "RPG", "シミュレーション", "ストラテジー", "パズル", "FPS", "ホラー", "シューティング", "レース"];

  const prompt = `占いをしてください。
                  内容は150文字程度で、男女関係なく楽しめるようにしてください。
                  占い結果、ラッキースポット、ラッキーフード、ラッキーゲームを以下の条件に基づいて生成してください。
                  1. 占い結果は、「最高」などの最上級表現を使わないこと。
                  2. ラッキースポットは、日本にある、${getRandomElement(category_spot)}かつ${getRandomElement(category_spot)}の中で、具体的な名称をランダムに選ぶこと。
                  3. ラッキーフードは、${getRandomElement(category_food)}かつ${getRandomElement(category_food)}をあわせもつ料理の具体的な名称をランダムに選ぶこと。
                  4. ラッキーゲームは、${getRandomElement(category_game)}と${getRandomElement(category_game)}をあわせもつゲームの具体的な名称をランダムに選ぶこと。
                  悪い内容が一切含まれないようにしてください。
                  以下がユーザ名です。
                  ${name_user}`;

  const result = await gemini.getModel().generateContent(prompt);

  return result.response.text();
}

let chat;
async function conversation(prompt) {
  let history;

  // 以前の会話があるか
  if (chat) {
    history = await chat.getHistory();
  }
  chat = gemini.getModel().startChat({history});

  const result = await chat.sendMessage(prompt);

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

function getRandomElement(array) {
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error("引数は非空の配列でなければなりません");
  }
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
}

module.exports = { 
  generateAffirmativeWordByGemini,
  generateMorningGreets,
  generateUranaiResult,
  conversation,
  RequestPerDayGemini,
}
