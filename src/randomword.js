const fs = require('fs');
const pathNeg = './src/csv/affirmativeword_negative.csv';
const pathNrm = './src/csv/affirmativeword_normal.csv';
const pathPos = './src/csv/affirmativeword_positive.csv';
const pathEn  = './src/csv/affirmativeword_en.txt';

const HNY_WORDS = ["明けましておめでとう", "あけましておめでとう"];
const OHAYO_WORDS = ["おはよう"];
const OYASUMI_WORDS = ["おやすみ"];
const OTSUKARE_WORDS = ["おつかれ", "お疲れ"];
const CONDITIONS = [
  { keywords: HNY_WORDS, path: './src/csv/affirmativeword_hny.csv' },
  { keywords: OHAYO_WORDS, path: './src/csv/affirmativeword_morning.csv' },
  { keywords: OYASUMI_WORDS, path: './src/csv/affirmativeword_night.csv' },
  { keywords: OTSUKARE_WORDS, path: './src/csv/affirmativeword_gj.csv' },
];

async function getRandomWordByNegaposi(posttext, lang) {
  let path;
  let tokens;
  let sentiment;

  // 単語判定
  for (const condition of CONDITIONS) {
    for (const keyword of condition.keywords) {
      if (posttext.includes(keyword)) {
        return condition.path; // 一致するpathを返す
      }
    }
  }

  if (lang !== "日本語") {
    path = pathEn;
  } else if (matchingCondition) {
    path = matchingCondition.path;
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