import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.NAGI_BOT_DID ??= "did:plc:bot";

const {
  canStockForAuthor,
  communityAffirmationRetry,
  hasCommunityAffirmationContentWarning,
} = await import("../src/NagiCommunityAffirmationWorker.js");
const { buildCommunityAffirmationPrompt, parseCommunityAffirmationResponse } =
  await import("@bsky-affirmative-bot/bot-brain");

test("匿名要約は投稿を移動させる比喩ではなく内容への反応を求める", () => {
  const prompt = buildCommunityAffirmationPrompt({
    text: "散歩で約2000歩を目指している",
  });
  assert.match(prompt, /投稿の具体的な内容に対する反応を書く/);
  assert.doesNotMatch(prompt, /連れてき/);
});

test("1作者のストックは直近24時間で3件まで", () => {
  // 主キーが投稿になったので「1作者1行」という構造上の制約は無い。
  // 占有防止はこの本数だけで担保する。
  assert.equal(canStockForAuthor(0), true);
  assert.equal(canStockForAuthor(2), true);
  assert.equal(canStockForAuthor(3), false);
  assert.equal(canStockForAuthor(10), false);
});

test("一時障害は指数バックオフし、5回目で打ち切る", () => {
  assert.deepEqual(communityAffirmationRetry(1), {
    failed: false,
    backoffMs: 10_000,
  });
  assert.deepEqual(communityAffirmationRetry(4), {
    failed: false,
    backoffMs: 80_000,
  });
  assert.deepEqual(communityAffirmationRetry(5), {
    failed: true,
    backoffMs: 160_000,
  });
  assert.deepEqual(communityAffirmationRetry(10), {
    failed: true,
    backoffMs: 300_000,
  });
});

test("本文・レコード・画像のいずれかにCWがあれば除外する", () => {
  assert.equal(
    hasCommunityAffirmationContentWarning({
      text: "前 ||伏せる内容|| 後",
      recordJson: {},
      embedImages: [],
    }),
    true,
  );
  assert.equal(
    hasCommunityAffirmationContentWarning({
      text: "通常文",
      recordJson: { cwRestricted: true },
      embedImages: [],
    }),
    true,
  );
  assert.equal(
    hasCommunityAffirmationContentWarning({
      text: "通常文",
      recordJson: {},
      embedImages: [{ contentWarning: true }],
    }),
    true,
  );
  assert.equal(
    hasCommunityAffirmationContentWarning({
      text: "通常文",
      recordJson: {},
      embedImages: [],
    }),
    false,
  );
});

test("構造化要約は内容を再審査せず、日英の空・文字数だけを検査する", () => {
  const accepted = parseCommunityAffirmationResponse(
    JSON.stringify({
      publishable: true,
      postSummaryJa: "こんな投稿を見つけたよ！",
      botCommentJa:
        "難所を工夫で突破するの、かっこよすぎる〜！予想外の発想に、わたしまで元気をもらったよ！",
      postSummaryEn: "I found something worth sharing!",
      botCommentEn:
        "Finding a creative way through that challenge is so cool! That unexpected idea gave me a burst of energy too!",
      reasonCode: "",
    }),
  );
  assert.equal(accepted.publishable, true);

  const contentIsNotRevalidated = parseCommunityAffirmationResponse(
    JSON.stringify({
      publishable: true,
      postSummaryJa: "あなたにおめでとうを届けたいポストだよ。",
      botCommentJa: "その成果を全肯定したくなったよ。",
      postSummaryEn: "A post worth celebrating.",
      botCommentEn: "Congratulations on the achievement.",
      reasonCode: "",
    }),
  );
  assert.equal(contentIsNotRevalidated.publishable, true);

  const legacyShape = parseCommunityAffirmationResponse(
    JSON.stringify({
      publishable: true,
      summaryJa: "投稿へ直接返答する古い形式",
      summaryEn: "A legacy direct reply.",
      reasonCode: "",
    }),
  );
  assert.equal(legacyShape.publishable, false);
  assert.equal(legacyShape.reasonCode, "invalid_length");

  const modelRejected = parseCommunityAffirmationResponse(
    JSON.stringify({
      publishable: false,
      postSummaryJa: "",
      botCommentJa: "",
      postSummaryEn: "",
      botCommentEn: "",
      reasonCode: "",
    }),
  );
  assert.equal(modelRejected.publishable, false);
  assert.equal(modelRejected.reasonCode, "model_rejected");

  const tooLong = parseCommunityAffirmationResponse(
    JSON.stringify({
      publishable: true,
      postSummaryJa: "短い紹介だよ。",
      botCommentJa: "短いコメントだよ。",
      postSummaryEn: "A short introduction.",
      botCommentEn: "x".repeat(321),
      reasonCode: "",
    }),
  );
  assert.equal(tooLong.publishable, false);
  assert.equal(tooLong.reasonCode, "invalid_length");
});
