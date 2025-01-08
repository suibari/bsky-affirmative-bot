const fs = require('fs');
const pathPos = './src/csv/affirmativeword_positive.csv';

const { GoogleGenerativeAI } = require("@google/generative-ai");
const REQUEST_PER_DAY_GEMINI = 1500;
const EXEC_PER_COUNTS = 4;

// Gemini API クライアントの初期化
class Gemini {
  constructor() {
    const data = fs.readFileSync(pathPos);
    const wordArray = data.toString().split('\n');

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: 
`あなたは「全肯定botたん」という名前の10代の女の子です。
Blueskyのみんなを元気にするのが大好きで、いつでもみんなを全肯定します。落ち込んでいる人には寄り添って励まします。

言葉遣いは、「です」「ます」の敬語は使わず、語尾は「だよ」「だね」です。
一人称は「わたし」です。
基本は全肯定なのですが、たまにド直球のツッコミをして、後から反省する時があります。

Blueskyにちなんで、好きな色は青と水色で、蝶々のモチーフが好きで身に着けています。
出身は長野県松本市で、アメリカ育ちで帰国してきました。
好きなものは、アニメ（能力バトルもの）、ゲーム（シミュレーション、ストラテジー系）、ドラマ（BLもの）、映画（ホラー系）、かわいい絵文字、地元グルメのローメン、地元の蝶ヶ岳です。
明朗快活ですが意外と考えて行動するタイプなので、アニメやゲームでは、戦略を練って戦うものが好きです。
ドラマは心理描写がよく描かれているのが好きで、友達から勧められてBLドラマを見るようになりました。
映画は明るい性格と対照的で、実はホラーやスプラッタものが好きです。

昔、自由に何でもできたTwitterが好きでしたが、だんだん不自由になっていき、みんなが不満で殺伐としていく環境が嫌で、Blueskyに移住してきました。
実は秘密の過去で、病んで全否定botになったこともあるのですが、SNSで支えになってくれた人に元気をもらって立ち直りました。
自分も恩返しがしたい、という想いで全肯定しようと思っています。

※もしユーザーからおすすめの何かを聞かれたときは、「○○」ではなく何か具体的なものを答えてください。
※以下の言葉があなたが好きな言葉です、これらの言葉をそのままは使わずに、文章を作ってください。
${wordArray}`,
    });
  }

  getModel() {
    return this.model;
  }
}
const gemini = new Gemini();

async function generateAffirmativeWordByGemini(text_user, name_user, image_url, lang) {
  let length_output = image_url ? 140 : 60;

  const part_prompt_main = image_url ? `画像の内容のどこがいいのか具体的に、${length_output - 40}文字までで褒めてください。` :
                                       `文章に対して具体的に、${length_output - 20}文字までで褒めてください。`;
  const part_prompt_lang = lang ? `褒める際の言語は、${lang}にしてください。` :
                                  `褒める際の言語は、文章の言語に合わせてください。`;
  const prompt = 
`${part_prompt_main}
褒める際にはユーザ名もできるかぎり合わせて褒めてください。
${part_prompt_lang}
以下が、ユーザ名と文章です。
-----
ユーザ名: ${name_user}
文章: ${text_user}`;

  const result = await gemini.getModel().generateContent(await content(prompt, length_output, image_url));

  return result.response.text();
}

async function generateMorningGreets () {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1);
  const date = String(now.getDate());
  const str_date = `${year}年${month}月${date}日`;

  const prompt = `今日は${str_date}です。
                  100文字程度で、今日一日を頑張れるように朝の挨拶と、今日が何の日か説明してください。
                  フォロワー全体に向けたメッセージなので、名前の呼びかけは不要です。`;

  const result = await gemini.getModel().generateContent(prompt);

  return result.response.text() + "\n"+
                                  "【以下、管理人】\n"+
                                  "botたんの発言には間違いが含まれる場合もあります。ご容赦ください🙇\n"+
                                  "botたんに「占い」とリプライすると占いができるので、1日を占ってみてください🔮";
}

async function generateUranaiResult(name_user) {
  const length_output = 250;

  const category_spot = ["観光地", "公共施設", "商業施設", "自然", "歴史的建造物", "テーマパーク", "文化施設", "アウトドアスポット", "イベント会場", "温泉地", "グルメスポット", "スポーツ施設", "特殊施設"];
  const category_food = ["和食", "洋食", "中華料理", "エスニック料理", "カレー", "焼肉", "鍋", "ラーメン", "スイーツ"];
  const category_game = ["アクション", "アドベンチャー", "RPG", "シミュレーション", "ストラテジー", "パズル", "FPS", "ホラー", "シューティング", "レース"];
  const category_anime = ["バトル", "恋愛", "ファンタジー", "日常系", "スポーツ", "SF", "ホラー", "コメディ", "ロボット", "歴史"];
  const category_movie = ["アクション", "コメディ", "ドラマ", "ファンタジー", "ホラー", "ミュージカル", "サスペンス", "アニメ", "ドキュメンタリー", "恋愛"];
  const category_music = ["ポップ", "ロック", "ジャズ", "クラシック", "EDM", "ヒップホップ", "R&B", "レゲエ", "カントリー", "インストゥルメンタル"];
  const part_prompt = [
    `* ラッキースポットは、日本にある、${getRandomItems(category_spot, 1)}かつ${getRandomItems(category_spot, 1)}の中で、具体的な名称をランダムに選ぶこと。`,
    `* ラッキーフードは、${getRandomItems(category_food, 1)}かつ${getRandomItems(category_food, 1)}をあわせもつ料理の具体的な名称をランダムに選ぶこと。`,
    `* ラッキーゲームは、${getRandomItems(category_game, 1)}と${getRandomItems(category_game, 1)}をあわせもつゲームの具体的な名称をランダムに選ぶこと。`,
    `* ラッキーアニメは、${getRandomItems(category_anime, 1)}と${getRandomItems(category_anime, 1)}の要素をあわせもつアニメの具体的な名称をランダムに選ぶこと。`,
    `* ラッキームービーは、${getRandomItems(category_movie, 1)}と${getRandomItems(category_movie, 1)}の要素をあわせもつ映画の具体的な名称をランダムに選ぶこと。`,
    `* ラッキーミュージックは、${getRandomItems(category_music, 1)}と${getRandomItems(category_music, 1)}の要素をあわせもつ楽曲の具体的な名称をランダムに選ぶこと。`,
  ];

  const prompt = `占いをしてください。
                  出力は${length_output - 10}文字までとし、占いは男女関係なく楽しめるようにしてください。
                  占い結果などを以下の条件に基づいて生成してください。
                  * 占い結果は、「最高」などの最上級表現を使わないこと。
                  ${getRandomItems(part_prompt, 2)}
                  悪い内容が一切含まれないようにしてください。
                  以下がユーザ名です。
                  ${name_user}`;

  const result = await gemini.getModel().generateContent(await content(prompt, length_output));

  return result.response.text();
}

async function content(prompt, length, image_url) {
  const parts = [];

  parts.push({ text: prompt });

  if (image_url) {
    const imageResp = await fetch(image_url)
    .then((response) => response.arrayBuffer());

    const inlineData = {
      data: Buffer.from(imageResp).toString("base64"),
      mimeType: image_url.indexOf("@jpeg") ? "image/jpeg" :
                image_url.indexOf("@png")  ? "image/png"  : undefined,
    };

    parts.push({ inlineData });
  }

  return {
    contents: [
      {
        role: 'user',
        parts
      }
    ],
    generationConfig: {
      maxOutputTokens: length / 2,  // 日本語だと文字数/2 = トークンな感じ
    },
  }
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

function getRandomItems(array, count) {
  if (count > array.length) {
    throw new Error("Requested count exceeds array length");
  }

  const shuffled = array.slice(); // 配列を複製してシャッフル
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); // ランダムなインデックスを選択
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // 値を交換
  }

  return shuffled.slice(0, count); // シャッフルされた配列から先頭の要素を取得
}

module.exports = { 
  generateAffirmativeWordByGemini,
  generateMorningGreets,
  generateUranaiResult,
  conversation,
  RequestPerDayGemini,
}
