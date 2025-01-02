const fs = require('fs');
const pathNeg = './src/csv/affirmativeword_negative.csv';
const pathNrm = './src/csv/affirmativeword_normal.csv';
const pathPos = './src/csv/affirmativeword_positive.csv';

const HNY_WORDS = ["明け", "あけ"];
const OHAYO_WORDS = ["おはよう"];
const OYASUMI_WORDS = ["おやすみ"];
const OTSUKARE_WORDS = ["つかれ", "疲れ"];
const CONDITIONS = [
  { keywords: HNY_WORDS, path: './src/csv/affirmativeword_hny.csv' },
  { keywords: OHAYO_WORDS, path: './src/csv/affirmativeword_morning.csv' },
  { keywords: OYASUMI_WORDS, path: './src/csv/affirmativeword_night.csv' },
  { keywords: OTSUKARE_WORDS, path: './src/csv/affirmativeword_gj.csv' },
];

async function getRandomWordByNegaposi(posttext) {
  let path;
  let tokens;
  let sentiment;

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

  const matchingCondition = CONDITIONS.find(condition =>
    tokens.some(token => condition.keywords.includes(token))
  );

  if (matchingCondition) {
    path = matchingCondition.path;
  } else {
    if (sentiment <= -0.2) {
      path = pathNeg;
    } else if (sentiment <= 0.2) {
      path = pathNrm;
    } else {
      path = pathPos;
    };
  };

  const data = fs.readFileSync(path);
  const wordArray = data.toString().split('\n');
  
  let rand = Math.random();
  rand = Math.floor(rand*wordArray.length);
  const text = wordArray[rand];
  return text;
}

module.exports.getRandomWordByNegaposi = getRandomWordByNegaposi;