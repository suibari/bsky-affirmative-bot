import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPredefinedAffirmation,
  predefinedAffirmation,
} from "../src/predefinedAffirmation.js";

test("日本語の感情カテゴリから表示名入り定型文を返す", async () => {
  const result = await predefinedAffirmation(
    {
      text: "できた！",
      languageName: "日本語",
      displayName: "なぎ",
    },
    {
      classify: async () => "positive",
      select: async (templates) =>
        templates.findIndex((template) => template.includes("${name}")),
    },
  );

  assert.match(result, /なぎ/);
  assert.doesNotMatch(result, /\$\{name\}/);
});

test("英語では英語のneutral定型文セットを使う", async () => {
  let firstCandidate = "";
  const result = await predefinedAffirmation(
    {
      text: "ordinary post",
      languageName: "English",
      displayName: "Nagi",
    },
    {
      classify: async () => "neutral",
      select: async (templates) => {
        firstCandidate = templates[0];
        return 0;
      },
    },
  );

  assert.equal(result, firstCandidate);
  assert.equal(result, "So true.");
});

test("日英以外はローカル翻訳結果を使い表示名を置換する", async () => {
  const result = await predefinedAffirmation(
    {
      text: "hola",
      languageName: "Spanish",
      displayName: "Nagi",
    },
    {
      classify: async () => "neutral",
      select: async () => 0,
      translate: async () => "Todo bien, ${name}.",
    },
  );

  assert.equal(result, "Todo bien, Nagi.");
});

test("Ollama未設定時の分類はneutralへfail-safeする", async () => {
  const originalBaseUrl = process.env.OLLAMA_BASE_URL;
  const originalModel = process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  try {
    assert.equal(await classifyPredefinedAffirmation("anything"), "neutral");
  } finally {
    if (originalBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = originalBaseUrl;
    if (originalModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = originalModel;
  }
});
