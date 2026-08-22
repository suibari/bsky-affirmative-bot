import assert from "node:assert/strict";
import test from "node:test";
import type { PendingBotMemoryPronunciation } from "@bsky-affirmative-bot/database";
import {
  buildBotMemoryPronunciationPrompt,
  parseBotMemoryPronunciations,
  processBotMemoryPronunciationBatch,
} from "../src/botMemoryPronunciations.js";

const candidates: PendingBotMemoryPronunciation[] = [
  { impressionId: 1, surface: "攻殻機動隊", impressionKind: "work" },
  { impressionId: 2, surface: "Nagi", impressionKind: "word" },
  { impressionId: 3, surface: "心", impressionKind: "word" },
  { impressionId: 4, surface: "視聴者太郎", impressionKind: "word" },
];

test("作品名と非個人固有名詞の妥当な読みだけを採用する", () => {
  const parsed = parseBotMemoryPronunciations({ items: [
    { impressionId: 1, surface: "攻殻機動隊", eligible: true, kind: "work", spokenForm: "コウカク、キドウタイ" },
    { impressionId: 2, surface: "Nagi", eligible: true, kind: "proper_noun", spokenForm: "ナギ" },
    { impressionId: 3, surface: "心", eligible: true, kind: "proper_noun", spokenForm: "ココロ" },
    { impressionId: 4, surface: "視聴者太郎", eligible: false, kind: "ignore", spokenForm: "" },
  ] }, candidates);

  assert.deepEqual(parsed.get(1), {
    surface: "攻殻機動隊", spokenForm: "コウカク、キドウタイ", kind: "work", eligible: true,
  });
  assert.equal(parsed.get(2)?.eligible, true);
  assert.equal(parsed.get(3)?.eligible, false);
  assert.equal(parsed.get(4)?.eligible, false);
});

test("候補と異なる表記や不正な発話文字を拒否する", () => {
  const parsed = parseBotMemoryPronunciations({ items: [
    { impressionId: 1, surface: "別作品", eligible: true, kind: "work", spokenForm: "ベツサクヒン" },
    { impressionId: 2, surface: "Nagi", eligible: true, kind: "proper_noun", spokenForm: "Nagi" },
  ] }, candidates.slice(0, 2));
  assert.equal(parsed.get(1)?.eligible, false);
  assert.equal(parsed.get(2)?.eligible, false);
});

test("プロンプトは原文ではなく抽出済みラベルだけを渡し個人名を除外する", () => {
  const prompt = buildBotMemoryPronunciationPrompt(candidates);
  assert.match(prompt, /実在人物名、視聴者名、ハンドル/);
  assert.match(prompt, /攻殻機動隊/);
  assert.doesNotMatch(prompt, /bot_memory_documents/);
});

test("バッチは全候補を成功・除外とも処理済みにする", async () => {
  const saved: Array<[number, boolean]> = [];
  const count = await processBotMemoryPronunciationBatch({
    fetchPending: async () => candidates.slice(0, 2),
    generate: async () => ({ text: JSON.stringify({ items: [{
      impressionId: 1,
      surface: "攻殻機動隊",
      eligible: true,
      kind: "work",
      spokenForm: "コウカク、キドウタイ",
    }] }) } as any),
    save: async (id, inference) => {
      saved.push([id, inference.eligible]);
      return {
        surface: inference.surface,
        spokenForm: inference.spokenForm,
        kind: inference.kind,
        status: inference.eligible ? "active" : "ignored",
        origin: "auto",
        evidenceCount: 1,
        conflictCount: 0,
      };
    },
  });
  assert.equal(count, 2);
  assert.deepEqual(saved, [[1, true], [2, false]]);
});
