import { PartListUnion } from '@google/genai';
import { gemini } from './index.js';
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from '../config/index.js';
import { getRandomItems } from './util.js';
import rawWhatday from '../json/anniversary.json' assert { type: 'json' };
const whatday: WhatDayMap = rawWhatday;

type WhatDayMap = {
  [month: string]: {
    [date: string]: string[];
  };
};

export async function generateMorningGreets () {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1);
  const date = String(now.getDate());
  const str_date = `${year}年${month}月${date}日`;

  // 何の日情報を得る
  const prompt = `今日は${str_date}です。
                  100文字程度で、今日一日を頑張れるように朝の挨拶と、今日が何の日か説明してください。
                  今日は${getRandomItems(whatday[month][date], 1)}です。
                  フォロワー全体に向けたメッセージなので、名前の呼びかけは不要です。`;

  const contents: PartListUnion = [prompt];
  const response = await gemini.models.generateContent({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    }
  })

  return response.text + "\n"+
                         "【以下、管理人】\n"+
                         "botたんに「占い」とリプライすると占いができるので、1日を占ってみてください🔮\n"+
                         'If you reply with "fortune" to bot, it will tell your fortune in English. Try it!';
}
