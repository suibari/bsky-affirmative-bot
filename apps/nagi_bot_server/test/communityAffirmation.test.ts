import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.NAGI_BOT_DID ??= "did:plc:bot";

const {
  canReplaceCommunityCandidate,
  chooseCommunityCandidate,
  communityAffirmationRetry,
  hasCommunityAffirmationContentWarning,
} = await import("../src/NagiCommunityAffirmationWorker.js");
const { parseCommunityAffirmationResponse } =
  await import("@bsky-affirmative-bot/bot-brain");
const { COMMUNITY_AFFIRMATION_PROMPT_VERSION } =
  await import("@bsky-affirmative-bot/bot-brain");

const candidate = (did: string, uri: string) =>
  ({
    post: { did, uri },
    pdsUrl: "https://pds.example",
    reactionCount: 0,
  }) as any;

test("作者内では既存と異なる先頭候補を1件だけ選ぶ", () => {
  const selected = chooseCommunityCandidate([
    candidate("did:plc:a", "at://a/first"),
    candidate("did:plc:a", "at://a/second"),
  ]);
  assert.equal(selected?.post.uri, "at://a/first");
  const next = chooseCommunityCandidate(
    [
      {
        ...candidate("did:plc:a", "at://a/first"),
        post: { did: "did:plc:a", uri: "at://a/first", cid: "one" },
      },
      {
        ...candidate("did:plc:a", "at://a/second"),
        post: { did: "did:plc:a", uri: "at://a/second", cid: "two" },
      },
    ] as any,
    { sourceUri: "at://a/first", sourceCid: "one" },
  );
  assert.equal(next?.post.uri, "at://a/second");
});

test("同じ作者の候補は24時間の次回生成時刻まで置き換えない", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");
  assert.equal(canReplaceCommunityCandidate(undefined, now), true);
  assert.equal(
    canReplaceCommunityCandidate(
      {
        state: "posted",
        nextEligibleAt: new Date("2026-07-30T12:00:01.000Z"),
        promptVersion: COMMUNITY_AFFIRMATION_PROMPT_VERSION,
      },
      now,
    ),
    false,
  );
  assert.equal(
    canReplaceCommunityCandidate(
      {
        state: "posted",
        nextEligibleAt: new Date("2026-07-30T12:00:00.000Z"),
        promptVersion: COMMUNITY_AFFIRMATION_PROMPT_VERSION,
      },
      now,
    ),
    true,
  );
  assert.equal(
    canReplaceCommunityCandidate(
      {
        state: "rejected",
        nextEligibleAt: new Date("2026-07-31T12:00:00.000Z"),
        promptVersion: "nagi-community-affirmation-v3",
      },
      now,
    ),
    true,
  );
  assert.equal(
    canReplaceCommunityCandidate(
      {
        state: "processing",
        nextEligibleAt: new Date("2026-07-30T11:00:00.000Z"),
        promptVersion: COMMUNITY_AFFIRMATION_PROMPT_VERSION,
      },
      now,
    ),
    false,
  );
  assert.equal(
    canReplaceCommunityCandidate(
      {
        state: "posted",
        nextEligibleAt: new Date("2026-07-31T12:00:00.000Z"),
        promptVersion: "nagi-community-affirmation-v1",
      },
      now,
    ),
    true,
  );
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
        "難所を工夫で突破するの、かっこよすぎる〜！みんなにも聞いてほしくて連れてきちゃった！",
      postSummaryEn: "I found something worth sharing!",
      botCommentEn:
        "Finding a creative way through that challenge is so cool! I had to bring this one over for everyone to hear.",
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
