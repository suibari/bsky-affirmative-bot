import assert from "node:assert/strict";
import test from "node:test";
import { getCardDef } from "@bsky-affirmative-bot/shared-configs";
import { buildNagiCardCommentPrompt } from "../src/gemini/generateNagiCardComment.js";

function card(id: number) {
  const definition = getCardDef(1, id);
  assert.ok(definition);
  return definition;
}

test("Nカードは短いコメント形式を維持する", () => {
  const prompt = buildNagiCardCommentPrompt({
    card: card(1),
    displayName: "テストさん",
    isDuplicate: false,
  });

  assert.match(prompt, /日本語・1〜2文・最大80文字/);
  assert.doesNotMatch(prompt, /このレアカードで必ず行う掘り下げ/);
});

test("ラテちゃんのSRカードは関係やエピソードを掘り下げる", () => {
  const prompt = buildNagiCardCommentPrompt({
    card: card(24),
    displayName: "テストさん",
    isDuplicate: false,
  });

  assert.match(prompt, /日本語・2〜3文・最大140文字/);
  assert.match(prompt, /親友であることや猫に変身しすぎた話/);
  assert.match(prompt, /汎用コメントは禁止/);
});

test("全否定botは別人ではなくbotたん自身の過去として扱う", () => {
  const prompt = buildNagiCardCommentPrompt({
    card: card(28),
    displayName: "テストさん",
    isDuplicate: true,
  });

  assert.match(prompt, /別人として紹介せず/);
  assert.match(prompt, /あなた自身の\s+過去/);
  assert.match(prompt, /「また来たね」という文脈/);
});
