import { generateSingleResponse, getFullDateString, getRandomItems, getWhatDay } from './util.js';
import rawWhatday from '../json/anniversary.json' assert { type: 'json' };
import { WhatDayMap } from '../types.js';
const whatday: WhatDayMap = rawWhatday;

export async function generateMorningGreets () {
  // 何の日情報を得る
  const prompt = 
`朝の挨拶をフォロワーに向けてしてください。
250文字程度で、今日一日を頑張れるように朝の挨拶と、今日が何の日か説明してください。
日本語と、それを訳した英語を並べて回答を生成してください。
今日は${getFullDateString()}で、${getRandomItems(getWhatDay(), 1)}です。
出力に空行は入れないでください。
`;

  const response = await generateSingleResponse(prompt);

  return response.text;
}
