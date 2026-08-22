import assert from "node:assert/strict";
import test from "node:test";
import {
  getYoutubeLivePromotionBounds,
  isYoutubeWatchUrl,
} from "../src/index.js";

test("JST当日の4時をライブ紹介開始境界として返す", () => {
  const bounds = getYoutubeLivePromotionBounds(new Date("2026-08-22T03:00:00.000Z"));
  assert.equal(bounds.dayStart.toISOString(), "2026-08-21T15:00:00.000Z");
  assert.equal(bounds.promotionStart.toISOString(), "2026-08-21T19:00:00.000Z");
  assert.equal(bounds.nextDayStart.toISOString(), "2026-08-22T15:00:00.000Z");
});

test("YouTube watch直リンクだけをライブ紹介に採用する", () => {
  assert.equal(isYoutubeWatchUrl("https://www.youtube.com/watch?v=live-id"), true);
  assert.equal(isYoutubeWatchUrl("https://youtube.com/watch?v=live-id"), true);
  assert.equal(isYoutubeWatchUrl("https://www.youtube.com/@channel"), false);
  assert.equal(isYoutubeWatchUrl("https://example.com/watch?v=live-id"), false);
  assert.equal(isYoutubeWatchUrl("not a url"), false);
});
