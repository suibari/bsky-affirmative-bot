import { Holiday } from "../types";

export function dateForHoliday(year: number, h: Holiday): Date {
  switch (h.rule.type) {
    case "fixed":
      return new Date(Date.UTC(year, h.rule.month - 1, h.rule.day, 0, 0, 0, 0));
    case "nth-weekday":
      return nthWeekdayOfMonthUTC(year, h.rule.month, h.rule.week, h.rule.weekday);
    case "easter":
      return h.rule.calendar === "western" ? westernEasterUTC(year) : orthodoxEasterUTC(year);
  }
}

/**
 * Dateを--MM-DDに変換
 * @param date 
 * @returns 
 */
export function toMonthDayIso(date: Date): string {
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `--${m}-${d}`;
}

/**
 * --MM-DDをDateに変換(年はダミーで2025を入れる)
 * @param md 
 * @returns 
 */
export function parseMonthDay(md: string): Date | null {
  // md = "--MM-DD"
  const match = md.match(/^--(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, m, d] = match;
  return new Date(Date.UTC(2025, parseInt(m) - 1, parseInt(d))); 
}

function nthWeekdayOfMonthUTC(year: number, month: number, week: number, weekday: number): Date {
  // month: 1-12, weekday: 0=Sun..6=Sat, week: 1=第1
  const first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (7 + weekday - first.getUTCDay()) % 7;
  const day = 1 + shift + (week - 1) * 7;
  return new Date(Date.UTC(year, month - 1, day));
}

function westernEasterUTC(year: number): Date {
  // Meeus/Jones/Butcher（グレゴリオ暦）
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function orthodoxEasterUTC(year: number): Date {
  // （必要になったら差し替え）ユリウス暦→グレゴリオ暦換算の簡易版
  // ここではプレースホルダ
  return westernEasterUTC(year); // 当面未使用なら流用
}
