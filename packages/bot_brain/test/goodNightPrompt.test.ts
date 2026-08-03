import assert from "node:assert/strict";
import test from "node:test";
import { buildGoodNightPrompt } from "../src/gemini/generateGoodNight.js";

const base = {
  currentMood: "のんびりしていた",
  topPost: "今日はいいことがあった",
};

test("Nagi選出時はリポスト済みと説明せずURLの追記をシステムへ任せる", () => {
  const prompt = buildGoodNightPrompt({ ...base, topPostNetwork: "nagi" });

  assert.match(prompt, /全肯定されたポストはNagiの投稿/);
  assert.match(prompt, /リポスト済みとは書かない/);
  assert.match(prompt, /スレッドURLはシステムが本文末尾に追加/);
});

test("Bluesky選出時は既存どおりリポスト済みの感想を求める", () => {
  const prompt = buildGoodNightPrompt({ ...base, topPostNetwork: "bsky" });

  assert.match(prompt, /リポスト済みなので、感想のみ/);
  assert.doesNotMatch(prompt, /全肯定されたポストはNagiの投稿/);
});
