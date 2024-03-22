const fs = require('fs');
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
  let path;
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
    sentiment = json.sentiment;
  } else {
    throw new Error('Failed to fetch sentiment from NEGPOSI_URL');
  }

  if (sentiment <= -0.2) {
    path = pathNeg;
  } else if (sentiment <= 0.2) {
    path = pathNrm;
  } else {
    path = pathPos;
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