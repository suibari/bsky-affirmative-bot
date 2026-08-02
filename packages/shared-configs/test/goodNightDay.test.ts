import assert from "node:assert/strict";
import test from "node:test";
import {
  goodNightDayRange,
  isInGoodNightDayRange,
} from "../src/util/goodNightDay.js";

test("JST 4:00から翌4:00までを同じおやすみ日付として扱う", () => {
  const beforeFour = goodNightDayRange(new Date("2026-08-03T03:59:59+09:00"));
  assert.equal(beforeFour.date, "2026-08-02");
  assert.equal(beforeFour.start.toISOString(), "2026-08-01T19:00:00.000Z");
  assert.equal(beforeFour.end.toISOString(), "2026-08-02T19:00:00.000Z");

  const atFour = goodNightDayRange(new Date("2026-08-03T04:00:00+09:00"));
  assert.equal(atFour.date, "2026-08-03");
  assert.equal(atFour.start.toISOString(), "2026-08-02T19:00:00.000Z");
  assert.equal(atFour.end.toISOString(), "2026-08-03T19:00:00.000Z");
});

test("開始時刻を含み、終了時刻を現在のおやすみ日付には含めない", () => {
  const range = goodNightDayRange(new Date("2026-08-03T23:00:00+09:00"));
  assert.equal(isInGoodNightDayRange(new Date("2026-08-03T03:59:59+09:00"), range), false);
  assert.equal(isInGoodNightDayRange(new Date("2026-08-03T04:00:00+09:00"), range), true);
  assert.equal(isInGoodNightDayRange(new Date("2026-08-04T03:59:59+09:00"), range), true);
  assert.equal(isInGoodNightDayRange(new Date("2026-08-04T04:00:00+09:00"), range), false);
});
