import rawWhatday from '../json/anniversary.json' with { type: 'json' };
import { WhatDayMap } from '../types.js';

const whatday: WhatDayMap = rawWhatday as unknown as WhatDayMap;

export function getRandomItems(array: string[], count: number) {
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

export function getFullDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1);
  const date = String(now.getDate());

  return `${year}年${month}月${date}日`;
}

export function getFullDateAndTimeString(): string {
  const fulldate = getFullDateString();
  const now = new Date();
  const hours = String(now.getHours());
  const minutes = String(now.getMinutes());

  return `${fulldate}${hours}時${minutes}分`;
}

export function getWhatDay() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1);
  const date = String(now.getDate());

  return whatday[month][date];
}
