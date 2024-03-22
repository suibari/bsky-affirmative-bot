const fs = require('fs');
const pathOhayo    = './src/csv/affirmativeword_morning.csv';
const pathOyasumi  = './src/csv/affirmativeword_night.csv';
const pathOtsukare = './src/csv/affirmativeword_gj.csv';
const pathNeg = './src/csv/affirmativeword_negative.csv';
const pathNrm = './src/csv/affirmativeword_normal.csv';
const pathPos = './src/csv/affirmativeword_positive.csv';

function getHalfLength(str) {
  let len = 0;
  let escapeStr = encodeURI(str);
  for (let i = 0; i < escapeStr.length; i++, len++) {
    if (escapeStr.charAt(i) == "%") {
      if (escapeStr.charAt(++i) == "u") {
        i += 3;
        len++;
      }
      i++;
    }
  }
  return len;
}

async function getRandomWordByNegaposi(posttext) {
  const ohayoArray = ["おはよう"];
  const oyasumiArray = ["おやすみ"];
  const otsukareArray = ["つかれ", "疲れ"];
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

  const isOhayo = tokens.some(elm => ohayoArray.includes(elm));
  const isOyasumi = tokens.some(elm => oyasumiArray.includes(elm));
  const isOtsukare = tokens.some(elm => otsukareArray.includes(elm));

  if (isOhayo) {
    path = pathOhayo;
  } else if (isOyasumi) {
    path = pathOyasumi;
  } else if (isOtsukare) {
    path = pathOtsukare;
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

module.exports.getHalfLength = getHalfLength;
module.exports.getRandomWordByNegaposi = getRandomWordByNegaposi;