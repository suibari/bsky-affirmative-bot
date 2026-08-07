const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const BOT_DAY_START_HOUR = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BotDayRange {
  date: string;
  start: Date;
  end: Date;
}

/** botたんの日次境界。JST 0:00〜3:59は前日として扱う。 */
export function botDayRange(date: Date = new Date()): BotDayRange {
  const shifted = new Date(
    date.getTime() + JST_OFFSET_MS - BOT_DAY_START_HOUR * 60 * 60 * 1000,
  );
  const dateString = shifted.toISOString().slice(0, 10);
  const start = new Date(`${dateString}T04:00:00+09:00`);
  return {
    date: dateString,
    start,
    end: new Date(start.getTime() + DAY_MS),
  };
}

export function isInBotDayRange(
  date: Date,
  range: Pick<BotDayRange, "start" | "end">,
): boolean {
  const timestamp = date.getTime();
  return timestamp >= range.start.getTime() && timestamp < range.end.getTime();
}
