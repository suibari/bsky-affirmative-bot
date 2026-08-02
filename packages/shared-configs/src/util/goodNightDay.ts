const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const GOOD_NIGHT_DAY_START_HOUR = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GoodNightDayRange {
  date: string;
  start: Date;
  end: Date;
}

/** botたんのおやすみ日付。JST 0:00〜3:59は前日として扱う。 */
export function goodNightDayRange(date: Date = new Date()): GoodNightDayRange {
  const shifted = new Date(
    date.getTime() + JST_OFFSET_MS - GOOD_NIGHT_DAY_START_HOUR * 60 * 60 * 1000,
  );
  const dateString = shifted.toISOString().slice(0, 10);
  const start = new Date(`${dateString}T04:00:00+09:00`);
  return {
    date: dateString,
    start,
    end: new Date(start.getTime() + DAY_MS),
  };
}

export function isInGoodNightDayRange(
  date: Date,
  range: Pick<GoodNightDayRange, "start" | "end">,
): boolean {
  const timestamp = date.getTime();
  return timestamp >= range.start.getTime() && timestamp < range.end.getTime();
}
