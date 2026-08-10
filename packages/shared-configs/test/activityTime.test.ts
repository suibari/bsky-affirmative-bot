import assert from "node:assert/strict";
import test from "node:test";
import { formatJstActivityTime } from "../src/util/common.js";

const now = new Date("2026-08-10T05:00:00Z"); // JST 8/10 14:00

test("UTCのISO入力をJSTの壁時計と相対時間で出す", () => {
  assert.equal(
    formatJstActivityTime("2026-08-10T02:05:00Z", now, true),
    "今日 11:05（2時間前）",
  );
  assert.equal(
    formatJstActivityTime("2026-08-10T02:05:00Z", now, false),
    "Today 11:05 (2h ago)",
  );
});

test("日をまたぐと昨日・N日前になる", () => {
  // JST 8/9 23:40
  assert.equal(
    formatJstActivityTime("2026-08-09T14:40:00Z", now, true),
    "昨日 23:40（14時間前）",
  );
  // JST 8/8 10:00
  assert.equal(
    formatJstActivityTime("2026-08-08T01:00:00Z", now, true),
    "8月8日 10:00（2日前）",
  );
  assert.equal(
    formatJstActivityTime("2026-08-08T01:00:00Z", now, false),
    "8/8 10:00 (2d ago)",
  );
});

test("1分未満と1時間未満の刻み", () => {
  assert.equal(
    formatJstActivityTime("2026-08-10T04:59:30Z", now, true),
    "今日 13:59（たった今）",
  );
  assert.equal(
    formatJstActivityTime("2026-08-10T04:20:00Z", now, true),
    "今日 13:20（40分前）",
  );
});

test("未来の時刻でも負の相対時間を出さない", () => {
  assert.equal(
    formatJstActivityTime("2026-08-10T06:00:00Z", now, true),
    "今日 15:00（たった今）",
  );
});

test("パースできない入力はそのまま返す（履歴1件で全体を壊さない）", () => {
  assert.equal(formatJstActivityTime("not-a-date", now, true), "not-a-date");
});

test("サーバーのタイムゾーンに依存しない", () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    const asUtc = formatJstActivityTime("2026-08-10T02:05:00Z", now, true);
    process.env.TZ = "Asia/Tokyo";
    const asJst = formatJstActivityTime("2026-08-10T02:05:00Z", now, true);
    assert.equal(asUtc, asJst);
    assert.equal(asUtc, "今日 11:05（2時間前）");
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
