import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDiaryEmoji } from "../src/gemini/generateUserDiary.js";

test("normalizes generated diary emoji", () => {
  assert.equal(normalizeDiaryEmoji(" 🌱 "), "🌱");
  assert.equal(normalizeDiaryEmoji("👩‍💻"), "👩‍💻");
  assert.equal(normalizeDiaryEmoji("🌱✨"), "✨");
  assert.equal(normalizeDiaryEmoji(""), "✨");
  assert.equal(normalizeDiaryEmoji(undefined), "✨");
});
