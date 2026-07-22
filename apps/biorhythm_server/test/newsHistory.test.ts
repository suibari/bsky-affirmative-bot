import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRecentNewsUses } from "../src/newsHistory.js";

test("7日より古い記事と重複・不正データを除く", () => {
  const now = Date.parse("2026-07-23T00:00:00.000Z");
  const result = normalizeRecentNewsUses([
    { articleId: "new", usedAt: "2026-07-22T00:00:00.000Z" },
    { articleId: "old", usedAt: "2026-07-01T00:00:00.000Z" },
    { articleId: "new", usedAt: "2026-07-21T00:00:00.000Z" },
    { articleId: "invalid", usedAt: "not-a-date" },
  ], now);

  assert.deepEqual(result, [
    { articleId: "new", usedAt: "2026-07-22T00:00:00.000Z" },
  ]);
});

test("旧形式の文字列IDも当日利用として読み込む", () => {
  const now = Date.parse("2026-07-23T00:00:00.000Z");
  assert.deepEqual(normalizeRecentNewsUses(["legacy-id"], now), [
    { articleId: "legacy-id", usedAt: "2026-07-23T00:00:00.000Z" },
  ]);
});
