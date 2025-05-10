import wordNeg from "../json/affirmativeword_negative.json";
import wordNrm from "../json/affirmativeword_normal.json";
import wordPos from "../json/affirmativeword_positive.json";
import wordNegEn from "../json/affirmativeword_negative_en.json";
import wordNrmEn from "../json/affirmativeword_normal_en.json";
import wordPosEn from "../json/affirmativeword_positive_en.json";
import { HNY_WORDS, OHAYO_WORDS, OYASUMI_WORDS, OTSUKARE_WORDS } from "../config/index.js";
import wordHny from "../json/affirmativeword_hny.json";
import wordMorning from "../json/affirmativeword_morning.json";
import wordNight from "../json/affirmativeword_night.json";
import wordGj from "../json/affirmativeword_gj.json";

const CONDITIONS = [
  { keywords: HNY_WORDS, word: wordHny },
  { keywords: OHAYO_WORDS, word: wordMorning },
  { keywords: OYASUMI_WORDS, word: wordNight },
  { keywords: OTSUKARE_WORDS, word: wordGj },
];

export async function getRandomWordByNegaposi(posttext: string, langStr: string) {
  let path;
  let sentiment = 0;
  let wordSpecial;
  let wordArray: string[] = [];

  // 単語判定
  for (const condition of CONDITIONS) {
    for (const keyword of condition.keywords) {
      if (posttext.includes(keyword)) {
        wordSpecial = condition.word; // 一致するpathを返す
      }
    }
  }

  if (wordSpecial) {
    // あいさつ判定
    wordArray = wordSpecial;
  } else {
    // ネガポジフェッチ
    const response = await fetch(process.env.NEGAPOSI_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({texts: [posttext]})
    });
  
    // レスポンスが正常であればsentimentを取得
    if (response.ok) {
      const json = await response.json();
      sentiment = json.average_sentiments;
    } else {
      throw new Error('Failed to fetch sentiment from NEGPOSI_URL');
    }

    // 感情分析
    if (langStr == "日本語") {
      if (sentiment <= -0.2) {
        wordArray = wordNeg;
      } else if (sentiment >= 0.2) {
        wordArray = wordPos;
      } else {
        wordArray = wordNrm;
      };
    } else {
      if (sentiment <= -0.05) {
        wordArray = wordNegEn;
      } else if (sentiment >= 0.05) {
        wordArray = wordPosEn;
      } else {
        wordArray = wordNrmEn;
      };
    }
  }
  
  let rand = Math.random();
  rand = Math.floor(rand * wordArray.length);
  const text = wordArray[rand];
  return text;
}
