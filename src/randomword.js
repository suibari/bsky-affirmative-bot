const fs = require('fs');
const pathNeg = './src/texts/affirmativeword_negative.txt';
const pathNrm = './src/texts/affirmativeword_normal.txt';
const pathPos = './src/texts/affirmativeword_positive.txt';
const pathEn  = './src/texts/affirmativeword_en.txt';

const HNY_WORDS = ["明けましておめでとう", "あけましておめでとう"];
const OHAYO_WORDS = ["おはよう"];
const OYASUMI_WORDS = ["おやすみ"];
const OTSUKARE_WORDS = ["おつかれ", "お疲れ"];
const CONDITIONS = [
  { keywords: HNY_WORDS, path: './src/texts/affirmativeword_hny.txt' },
  { keywords: OHAYO_WORDS, path: './src/texts/affirmativeword_morning.txt' },
  { keywords: OYASUMI_WORDS, path: './src/texts/affirmativeword_night.txt' },
  { keywords: OTSUKARE_WORDS, path: './src/texts/affirmativeword_gj.txt' },
];

async function getRandomWordByNegaposi(posttext, lang) {
  let path;
  let tokens;
  let sentiment;
  let pathCondition;

  // 単語判定
  for (const condition of CONDITIONS) {
    for (const keyword of condition.keywords) {
      if (posttext.includes(keyword)) {
        pathCondition = condition.path; // 一致するpathを返す
      }
    }
  }

  if (lang !== "日本語") {
    path = pathEn;
  } else if (pathCondition) {
    path = pathCondition;
  } else {
    // ネガポジフェッチ
    const response = await fetch(process.env.NEGAPOSI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({text: posttext})
    });
  
    // レスポンスが正常であればsentimentを取得
    if (response.ok) {
      const json = await response.json();
      tokens = json.tokens;
      sentiment = json.sentiment;
    } else {
      throw new Error('Failed to fetch sentiment from NEGPOSI_URL');
    }

    // 感情分析
    if (sentiment <= -0.2) {
      path = pathNeg;
    } else if (sentiment <= 0.2) {
      path = pathNrm;
    } else {
      path = pathPos;
    };
  }

  const data = fs.readFileSync(path);
  const wordArray = data.toString().split('\n');
  
  let rand = Math.random();
  rand = Math.floor(rand*wordArray.length);
  const text = wordArray[rand];
  return text;
}

module.exports.getRandomWordByNegaposi = getRandomWordByNegaposi;