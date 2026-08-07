const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * JST の "YYYY-MM-DD"。日次スナップショットの主キーと /timeline の既定日に使う。
 * サーバーのタイムゾーン設定に依存させたくないので、Intl ではなくオフセットで出す。
 */
export const jstDateString = (date: Date = new Date()): string =>
  new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);

/** JST の "YYYY-MM-DD" が指す1日の [開始, 終了)。 */
export const jstDayRange = (date: string): { start: Date; end: Date } => {
  const start = new Date(`${date}T00:00:00+09:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

export const isJstDateString = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00+09:00`));
