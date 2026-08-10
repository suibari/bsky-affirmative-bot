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

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** JST の壁時計に直した Date（getUTC* で読む前提）。botDay.ts / jstDate.ts と同じ固定オフセット方式。 */
const toJstWallClock = (date: Date) => new Date(date.getTime() + JST_OFFSET_MS);

const pad2 = (value: number) => String(value).padStart(2, "0");

/**
 * 行動履歴の1件を、botたんが読める時刻表記に直す。
 *
 * DB には UTC で入っているが、同じプロンプトに載る「現在時刻」は JST の壁時計表記なので、
 * ISO のまま並べるとモデルが9時間ずれて読む。roomEventPrompt.ts が「ISO と混ぜると読み違える」
 * として相対分を採用したのと同じ理由で、こちらは壁時計と相対時間を両方出す。
 *
 * 例: "今日 14:05（3時間前）" / "Yesterday 23:40 (14h ago)"
 * パースできない入力はそのまま返す（履歴が1件壊れてもプロンプト全体を壊さない）。
 */
export function formatJstActivityTime(
  at: string | Date,
  now: Date,
  ja: boolean,
): string {
  const timestamp = at instanceof Date ? at.getTime() : Date.parse(at);
  if (Number.isNaN(timestamp)) return String(at);

  const atJst = toJstWallClock(new Date(timestamp));
  const nowJst = toJstWallClock(now);
  const clock = `${pad2(atJst.getUTCHours())}:${pad2(atJst.getUTCMinutes())}`;

  const dayDiff = Math.round(
    (Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()) -
      Date.UTC(atJst.getUTCFullYear(), atJst.getUTCMonth(), atJst.getUTCDate())) /
      (24 * 60 * 60 * 1000),
  );
  const day =
    dayDiff === 0
      ? ja ? "今日" : "Today"
      : dayDiff === 1
        ? ja ? "昨日" : "Yesterday"
        : ja
          ? `${atJst.getUTCMonth() + 1}月${atJst.getUTCDate()}日`
          : `${atJst.getUTCMonth() + 1}/${atJst.getUTCDate()}`;

  // 未来の時刻は「たった今」に丸める（時計ずれで負の相対時間を出さない）。
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
  const relative =
    elapsedMinutes < 1
      ? ja ? "たった今" : "just now"
      : elapsedMinutes < 60
        ? ja ? `${elapsedMinutes}分前` : `${elapsedMinutes}m ago`
        : elapsedMinutes < 24 * 60
          ? ja ? `${Math.floor(elapsedMinutes / 60)}時間前` : `${Math.floor(elapsedMinutes / 60)}h ago`
          : ja ? `${Math.floor(elapsedMinutes / (24 * 60))}日前` : `${Math.floor(elapsedMinutes / (24 * 60))}d ago`;

  return ja ? `${day} ${clock}（${relative}）` : `${day} ${clock} (${relative})`;
}

export function getWhatDay() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1);
  const date = String(now.getDate());

  return getWhatDayForMonthDay(month, date);
}

/** ユーザーのローカル日付など、現在日以外の「今日は何の日」を取得する。 */
export function getWhatDayForMonthDay(month: string | number, date: string | number): string[] {
  return whatday[String(Number(month))]?.[String(Number(date))] ?? [];
}
