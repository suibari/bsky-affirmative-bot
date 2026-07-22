import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePositiveNewsBatch } from "../src/gemini/judgePositiveNewsBatch.js";

const input = [
  { articleId: "a", title: "受賞", categories: [] },
  { articleId: "b", title: "復旧", categories: [] },
];
const decision = (articleId: string) => ({ articleId, publishable: true, reasonCode: "positive_result", botCommentJa: "よかった！", titleEn: "Award", botCommentEn: "Wonderful!" });

test("入力外・欠落・重複IDをfail closedにする", () => {
  const result = sanitizePositiveNewsBatch(input, [decision("a"), decision("a"), decision("unknown")]);
  assert.deepEqual(result.map((item) => item.publishable), [false, false]);
});

test("掲載判定の空コメントを拒否する", () => {
  const result = sanitizePositiveNewsBatch(input.slice(0, 1), [{ ...decision("a"), botCommentJa: "" }]);
  assert.equal(result[0].publishable, false);
});
