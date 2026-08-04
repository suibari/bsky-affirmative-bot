import assert from "node:assert/strict";
import test from "node:test";
import {
  aiModel,
  resetAiRouteCache,
} from "@bsky-affirmative-bot/shared-configs";
import {
  classifyNagiReplyError,
  formatNagiReplyError,
  nagiAiRouteForAttempt,
  nextNagiReplyAttemptAt,
} from "../src/nagiReplyRetry.js";

test("408・429・5xxとネットワークエラーを一時障害に分類する", () => {
  for (const status of [408, 429, 500, 503, 599]) {
    assert.deepEqual(classifyNagiReplyError({ status }), {
      category: "transient",
      status,
    });
  }

  const networkCause = Object.assign(new Error("socket reset"), {
    code: "ECONNRESET",
  });
  const wrapped = new Error("Failed query", { cause: networkCause });
  assert.deepEqual(classifyNagiReplyError(wrapped), {
    category: "transient",
    code: "ECONNRESET",
  });
});

test("Gemini JSONメッセージと直接添付画像の失敗を一時障害に分類する", () => {
  const gemini = new Error(
    '{"error":{"code":503,"message":"high demand","status":"UNAVAILABLE"}}',
  );
  assert.deepEqual(classifyNagiReplyError(gemini), {
    category: "transient",
    status: 503,
  });

  const image = new Error(
    "Failed to fetch directly attached image 1; retrying the reply without omitting it",
    { cause: new Error("HTTP 400") },
  );
  assert.deepEqual(classifyNagiReplyError(image), {
    category: "transient",
    status: 400,
  });
});

test("400・401・403は恒久エラー、TypeErrorは分類不能にする", () => {
  for (const status of [400, 401, 403]) {
    assert.deepEqual(classifyNagiReplyError({ status }), {
      category: "permanent",
      status,
    });
  }
  assert.deepEqual(classifyNagiReplyError(new TypeError("bad argument")), {
    category: "unknown",
  });
});

test("エラー保存時はラッパーとroot causeの両方を残す", () => {
  const error = new Error("Failed query", {
    cause: new TypeError("Date must be a string"),
  });
  assert.equal(
    formatNagiReplyError(error),
    "Failed query | caused by: Date must be a string",
  );
});

test("試行回数に応じてFlex、Lite Standard、Flash Standardへ切り替える", () => {
  assert.deepEqual(nagiAiRouteForAttempt(1), {
    route: "lite-flex",
    model: aiModel("NAGI_REPLY_ATTEMPT_EARLY"),
    serviceTier: "flex",
  });
  assert.deepEqual(nagiAiRouteForAttempt(2), nagiAiRouteForAttempt(1));
  assert.deepEqual(nagiAiRouteForAttempt(3), {
    route: "lite-standard",
    model: aiModel("NAGI_REPLY_ATTEMPT_MID"),
    serviceTier: "standard",
  });
  assert.deepEqual(nagiAiRouteForAttempt(4), nagiAiRouteForAttempt(3));
  assert.deepEqual(nagiAiRouteForAttempt(5), {
    route: "flash-standard",
    model: aiModel("NAGI_REPLY_ATTEMPT_LATE"),
    serviceTier: "standard",
  });
});

test("ラダーの各段は AI_ROUTE_* で差し替えられる", () => {
  process.env.AI_ROUTE_NAGI_REPLY_ATTEMPT_EARLY = "flash-standard";
  resetAiRouteCache();
  try {
    assert.deepEqual(nagiAiRouteForAttempt(1), {
      route: "flash-standard",
      model: "gemini-2.5-flash",
      serviceTier: "standard",
    });
  } finally {
    delete process.env.AI_ROUTE_NAGI_REPLY_ATTEMPT_EARLY;
    resetAiRouteCache();
  }
});

test("一時障害はジッター付き段階バックオフで再試行する", () => {
  const createdAt = new Date("2026-07-29T00:00:00.000Z");
  const now = new Date("2026-07-29T00:00:10.000Z");
  const expectedDelays = [
    15_000,
    60_000,
    5 * 60_000,
    15 * 60_000,
    60 * 60_000,
    3 * 60 * 60_000,
    6 * 60 * 60_000,
    12 * 60 * 60_000,
  ];

  expectedDelays.forEach((delay, index) => {
    assert.equal(
      nextNagiReplyAttemptAt({
        attempt: index + 1,
        category: "transient",
        createdAt,
        now,
        random: () => 0.5,
      })?.getTime(),
      now.getTime() + delay,
    );
  });
});

test("再試行は作成から24時間で打ち切り、期限を越える待機は期限へ丸める", () => {
  const createdAt = new Date("2026-07-29T00:00:00.000Z");
  const nearDeadline = new Date("2026-07-29T23:00:00.000Z");
  assert.equal(
    nextNagiReplyAttemptAt({
      attempt: 8,
      category: "transient",
      createdAt,
      now: nearDeadline,
      random: () => 0.5,
    })?.toISOString(),
    "2026-07-30T00:00:00.000Z",
  );
  assert.equal(
    nextNagiReplyAttemptAt({
      attempt: 9,
      category: "transient",
      createdAt,
      now: new Date("2026-07-30T00:00:00.000Z"),
    }),
    undefined,
  );
});

test("恒久エラーは即時終了し、分類不能エラーは5回で終了する", () => {
  const createdAt = new Date("2026-07-29T00:00:00.000Z");
  const now = new Date("2026-07-29T00:01:00.000Z");
  assert.equal(
    nextNagiReplyAttemptAt({
      attempt: 1,
      category: "permanent",
      createdAt,
      now,
    }),
    undefined,
  );
  assert.ok(
    nextNagiReplyAttemptAt({
      attempt: 4,
      category: "unknown",
      createdAt,
      now,
      random: () => 0.5,
    }),
  );
  assert.equal(
    nextNagiReplyAttemptAt({
      attempt: 5,
      category: "unknown",
      createdAt,
      now,
    }),
    undefined,
  );
});
