import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.NAGI_BOT_DID ??= "did:plc:bot";

const { ApiError } = await import("../src/middleware/errors.js");
const {
  PRIVATE_LIST_LIMIT,
  assertPrivateListCapacity,
  validatePrivateListTarget,
} = await import("../src/queries/privateList.js");

test("private list target accepts plc and web DIDs", () => {
  assert.doesNotThrow(() =>
    validatePrivateListTarget("did:plc:owner", "did:plc:member", "did:plc:bot"),
  );
  assert.doesNotThrow(() =>
    validatePrivateListTarget(
      "did:plc:owner",
      "did:web:example.com",
      "did:plc:bot",
    ),
  );
});

test("private list rejects invalid, self, and Bot-tan targets", () => {
  for (const memberDid of ["not-a-did", "did:plc:owner", "did:plc:bot"]) {
    assert.throws(
      () =>
        validatePrivateListTarget("did:plc:owner", memberDid, "did:plc:bot"),
      ApiError,
    );
  }
});

test("private list capacity allows 199 and rejects 200", () => {
  assert.equal(PRIVATE_LIST_LIMIT, 200);
  assert.doesNotThrow(() => assertPrivateListCapacity(199));
  assert.throws(
    () => assertPrivateListCapacity(200),
    (error: unknown) => {
      return (
        error instanceof ApiError &&
        error.status === 409 &&
        error.error === "private_list_limit"
      );
    },
  );
});
