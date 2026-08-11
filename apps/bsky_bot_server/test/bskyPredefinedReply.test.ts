import assert from "node:assert/strict";
import test from "node:test";
import type { SentimentLabel } from "@bsky-affirmative-bot/bot-brain/predefined-affirmation";
import {
  createBskyPredefinedReply,
  parseBskyPredefinedSelectorMode,
} from "../src/features/bskyPredefinedReply.js";
import type { PredefinedReplyClassification } from "../src/features/predefinedReplyClassifier.js";

const classification = (
  label: SentimentLabel,
  llmCalls: number,
): PredefinedReplyClassification => ({
  method: "rules-ollama-three-way",
  label,
  latencyMs: 12,
  llmCalls,
  specialRule: llmCalls === 0 ? "direct" : null,
});

test("定型文選択モードはrandomを既定にし未知値を拒否する", () => {
  assert.equal(parseBskyPredefinedSelectorMode(undefined), "random");
  assert.equal(parseBskyPredefinedSelectorMode("random"), "random");
  assert.equal(parseBskyPredefinedSelectorMode("llm"), "llm");
  assert.throws(
    () => parseBskyPredefinedSelectorMode("roulette"),
    /must be random or llm/,
  );
});

test("randomモードは分類結果のカテゴリ内からLLMなしで選ぶ", async () => {
  let classifiedMethod = "";
  const reply = await createBskyPredefinedReply(
    {
      text: "おはよう！",
      languageName: "日本語",
      displayName: "なぎ",
    },
    {
      selectorMode: "random",
      random: () => 0,
      classify: async (input) => {
        classifiedMethod = input.method;
        return classification("morning", 0);
      },
    },
  );
  assert.equal(classifiedMethod, "rules-ollama-three-way");
  assert.ok(reply.length > 0);
});

test("llmモードは定型文選択を共通関数の既定選択器へ任せる", async () => {
  let injectedSelect = "unset";
  const reply = await createBskyPredefinedReply(
    {
      text: "ordinary post",
      languageName: "English",
      displayName: "Nagi",
    },
    {
      selectorMode: "llm",
      classify: async () => classification("neutral", 1),
      affirm: async (_input, dependencies) => {
        injectedSelect = dependencies.select ? "custom" : "default";
        return "All good.";
      },
    },
  );
  assert.equal(reply, "All good.");
  assert.equal(injectedSelect, "default");
});

test("日英以外は英語定型文を選んで対象言語へ翻訳する", async () => {
  let targetLanguage = "";
  let sourceTemplate = "";
  const reply = await createBskyPredefinedReply(
    {
      text: "hola",
      languageName: "Spanish",
      displayName: "Nagi",
    },
    {
      selectorMode: "random",
      random: () => 0,
      classify: async () => classification("neutral", 1),
      translate: async (template, target) => {
        sourceTemplate = template;
        targetLanguage = target;
        return "Todo bien, ${name}.";
      },
    },
  );
  assert.match(sourceTemplate, /[A-Za-z]/);
  assert.equal(targetLanguage, "Spanish");
  assert.equal(reply, "Todo bien, Nagi.");
});
