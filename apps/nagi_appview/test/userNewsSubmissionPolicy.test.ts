import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/middleware/errors.js";
import {
  jstDayStart,
  normalizeNewsUrl,
  validateNewsReviewSubject,
} from "../src/services/userNewsSubmissionPolicy.js";

test("normalizes tracking parameters without changing meaningful parameters", () => {
  assert.equal(
    normalizeNewsUrl("https://example.com/story?id=7&utm_source=nagi#section"),
    "https://example.com/story?id=7",
  );
});

test("uses the JST calendar boundary for daily submissions", () => {
  assert.equal(
    jstDayStart(new Date("2026-08-01T15:30:00.000Z")).toISOString(),
    "2026-08-01T15:00:00.000Z",
  );
});

test("accepts only the authenticated owner's news StrongRef", () => {
  const did = "did:plc:alice";
  assert.deepEqual(
    validateNewsReviewSubject(did, {
      uri: `at://${did}/com.suibari.nagi.news/abc`,
      cid: "bafy-test",
    }),
    { did, collection: "com.suibari.nagi.news", rkey: "abc" },
  );
  for (const uri of [
    "at://did:plc:bob/com.suibari.nagi.news/abc",
    `at://${did}/com.suibari.nagi.post/abc`,
    "not-an-at-uri",
  ]) {
    assert.throws(
      () => validateNewsReviewSubject(did, { uri, cid: "bafy-test" }),
      (error: unknown) => error instanceof ApiError && error.status === 403,
    );
  }
});
