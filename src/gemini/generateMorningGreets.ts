import { generateSingleResponse, getFullDateString, getRandomItems, getWhatDay } from './util.js';
import rawWhatday from '../json/anniversary.json' assert { type: 'json' };
import { WhatDayMap } from '../types.js';
const whatday: WhatDayMap = rawWhatday;

export async function generateMorningGreets () {
  // 何の日情報を得る
  const prompt = `今日は${getFullDateString()}です。
                  100文字程度で、今日一日を頑張れるように朝の挨拶と、今日が何の日か説明してください。
                  今日は${getRandomItems(getWhatDay(), 1)}です。
                  フォロワー全体に向けたメッセージなので、名前の呼びかけは不要です。`;

  const response = await generateSingleResponse(prompt);

  return response.text + "\n"+
                         "【以下、管理人】\n"+
                         "botたんに「占い」とリプライすると占いができるので、1日を占ってみてください🔮\n"+
                         'If you reply with "fortune" to bot, it will tell your fortune in English. Try it!';
}
