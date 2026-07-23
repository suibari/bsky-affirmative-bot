import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeGateDecisions } from "../src/gemini/judgePositiveNewsBatch.js";

const input = [
  { articleId: "a", title: "受賞", categories: [] },
  { articleId: "b", title: "復旧", categories: [] },
];
const decision = (articleId: string) => ({ articleId, publishable: true, reasonCode: "positive_result" });

test("入力外・欠落・重複IDをfail closedにする", () => {
  const result = sanitizeGateDecisions(input, [decision("a"), decision("a"), decision("unknown")]);
  assert.deepEqual(result.map((item) => item.publishable), [false, false]);
});

test("不正なreasonCode/publishableは掲載しない", () => {
  const result = sanitizeGateDecisions(input.slice(0, 1), [{ articleId: "a", publishable: true, reasonCode: "bogus" }]);
  assert.equal(result[0].publishable, false);
  assert.equal(result[0].reasonCode, "unclear");
});
