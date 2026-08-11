import assert from "node:assert/strict";
import test from "node:test";
import type { NegaposiApiResponse } from "@bsky-affirmative-bot/shared-configs";
import {
  classifyDictionaryScore,
  classifyPredefinedReply,
  detectDirectSpecialLabel,
  detectLegacySpecialLabel,
} from "../src/features/predefinedReplyClassifier.js";
import { fetchSentiment } from "../src/util/negaposi.js";

const negaposi = (score: number): NegaposiApiResponse => ({
  wakati: [[]],
  average_sentiments: [score],
  nouns: [[]],
  nouns_counts: [],
});

test("旧辞書の日本語・英語しきい値を再現する", () => {
  assert.equal(classifyDictionaryScore(-0.2, "日本語"), "negative");
  assert.equal(classifyDictionaryScore(0.199, "日本語"), "neutral");
  assert.equal(classifyDictionaryScore(0.2, "日本語"), "positive");
  assert.equal(classifyDictionaryScore(-0.05, "English"), "negative");
  assert.equal(classifyDictionaryScore(0.049, "English"), "neutral");
  assert.equal(classifyDictionaryScore(0.05, "English"), "positive");
});

test("旧挨拶判定は部分一致と後勝ちを再現する", () => {
  assert.equal(detectLegacySpecialLabel("おはなしを聞いた"), "morning");
  assert.equal(detectLegacySpecialLabel("おはよう、お疲れ"), "gj");
});

test("直接挨拶ルールは境界を見て引用を除外する", () => {
  assert.equal(detectDirectSpecialLabel("おはよう！今日もやるぞ"), "morning");
  assert.equal(detectDirectSpecialLabel("おはなしを聞いた"), null);
  assert.equal(detectDirectSpecialLabel("「おはよう」と言われた"), null);
  assert.equal(detectDirectSpecialLabel('They said "good night" to me.'), null);
  assert.equal(
    detectDirectSpecialLabel("おつかれと友達に言われて、振り返った。"),
    null,
  );
  assert.equal(
    detectDirectSpecialLabel("おつかれ、と友達に言われて、振り返った。"),
    "gj",
  );
});

test("複数の直接挨拶はルールで確定しない", () => {
  assert.equal(detectDirectSpecialLabel("おはよう。おやすみ"), null);
});

test("LLM 2段方式は1段目の挨拶分類で確定すれば2段目を呼ばない", async () => {
  let polarityCalls = 0;
  const result = await classifyPredefinedReply(
    {
      text: "お疲れさま！今日もよく頑張った。",
      languageName: "日本語",
      method: "ollama-special-then-polarity",
    },
    {
      classifySpecial: async () => "gj",
      classifyThreeWay: async () => {
        polarityCalls += 1;
        return "positive";
      },
    },
  );
  assert.equal(result.label, "gj");
  assert.equal(result.specialRule, "llm");
  assert.equal(result.llmCalls, 1);
  assert.equal(polarityCalls, 0);
});

test("LLM 2段方式は伝聞をotherとして2段目の感情分類へ渡せる", async () => {
  const result = await classifyPredefinedReply(
    {
      text: "おつかれ、と友達に言われて少しうれしかった。",
      languageName: "日本語",
      method: "ollama-special-then-polarity",
    },
    {
      classifySpecial: async () => "other",
      classifyThreeWay: async () => "positive",
    },
  );
  assert.equal(result.label, "positive");
  assert.equal(result.specialRule, null);
  assert.equal(result.llmCalls, 2);
});

test("consensusは辞書とLLMの不一致をneutralにする", async () => {
  const result = await classifyPredefinedReply(
    {
      text: "最高だね、全部壊れたけど",
      languageName: "日本語",
      method: "rules-dictionary-ollama-consensus",
    },
    {
      fetchSentiment: async () => negaposi(0.8),
      classifyThreeWay: async () => "negative",
    },
  );
  assert.equal(result.label, "neutral");
  assert.equal(result.consensusDisagreement, true);
  assert.equal(result.dictionaryScore, 0.8);
  assert.equal(result.error, undefined);
});

test("consensusは片方の障害をneutralとエラーに記録する", async () => {
  const result = await classifyPredefinedReply(
    {
      text: "普通の文",
      languageName: "日本語",
      method: "rules-dictionary-ollama-consensus",
    },
    {
      fetchSentiment: async () => {
        throw new Error("dictionary unavailable");
      },
      classifyThreeWay: async () => "positive",
    },
  );
  assert.equal(result.label, "neutral");
  assert.match(result.error ?? "", /dictionary unavailable/);
});

test("NEGPOSIクライアントはレスポンス件数を検証する", async () => {
  await assert.rejects(
    fetchSentiment(["a", "b"], {
      endpoint: "http://negaposi.test/analyze",
      fetchImpl: async () =>
        new Response(JSON.stringify(negaposi(0)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    }),
    /unexpected result count/,
  );
});
