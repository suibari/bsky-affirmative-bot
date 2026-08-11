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

  assert.equal(result, firstCandidate.replaceAll("${name}", "Nagi"));
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

test("日英以外の翻訳LLMが利用不能なら英語定型文へ戻る", async () => {
  const originalBaseUrl = process.env.OLLAMA_BASE_URL;
  const originalModel = process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  try {
    let englishTemplate = "";
    const result = await predefinedAffirmation(
      {
        text: "hola",
        languageName: "Spanish",
        displayName: "Nagi",
      },
      {
        classify: async () => "neutral",
        select: async (templates) => {
          englishTemplate = templates[0];
          return 0;
        },
      },
    );
    assert.equal(result, englishTemplate.replaceAll("${name}", "Nagi"));
  } finally {
    if (originalBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = originalBaseUrl;
    if (originalModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = originalModel;
  }
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

test("外部分類器を注入しても選択・名前置換を共通処理する", async () => {
  let classifiedText = "";
  let candidates: string[] = [];
  let selected = "";
  const result = await predefinedAffirmation(
    {
      text: "今日はしんどい",
      languageName: "日本語",
      displayName: "なぎ",
    },
    {
      classify: async (text) => {
        classifiedText = text;
        return "negative";
      },
      select: async (templates) => {
        candidates = templates;
        selected = templates[0];
        return 0;
      },
    },
  );

  assert.equal(classifiedText, "今日はしんどい");
  assert.ok(candidates.length > 0);
  assert.equal(result, selected.replaceAll("${name}", "なぎ"));
  assert.doesNotMatch(result, /\$\{name\}/);
});
