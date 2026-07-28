import assert from "node:assert/strict";
import test from "node:test";
import { shouldAcceptSemanticRecord } from "../src/ingest/semanticRecord.js";

const version = (uri: string, createdAt: string) => ({
  uri,
  createdAt: new Date(createdAt),
});

test("accepts the first semantic record", () => {
  assert.equal(
    shouldAcceptSemanticRecord(
      undefined,
      version("at://did:example/reaction/new", "2026-07-19T01:39:40.377Z"),
    ),
    true,
  );
});

test("keeps the newest semantic record regardless of processing order", () => {
  const older = version(
    "at://did:example/reaction/old",
    "2026-07-19T01:10:10.920Z",
  );
  const newer = version(
    "at://did:example/reaction/new",
    "2026-07-19T01:39:40.377Z",
  );

  assert.equal(shouldAcceptSemanticRecord(older, newer), true);
  assert.equal(shouldAcceptSemanticRecord(newer, older), false);
});

test("accepts an update to the same URI even when createdAt is unchanged", () => {
  const current = version(
    "at://did:example/diary/stable",
    "2026-07-19T01:10:10.920Z",
  );
  assert.equal(
    shouldAcceptSemanticRecord(
      current,
      version(current.uri, "2026-07-19T01:10:10.920Z"),
    ),
    true,
  );
});

test("uses URI as a deterministic tie-breaker for equal createdAt", () => {
  const lower = version(
    "at://did:example/blue.moji.collection.item/a",
    "2026-07-19T01:10:10.920Z",
  );
  const higher = version(
    "at://did:example/blue.moji.collection.item/b",
    "2026-07-19T01:10:10.920Z",
  );

  assert.equal(shouldAcceptSemanticRecord(lower, higher), true);
  assert.equal(shouldAcceptSemanticRecord(higher, lower), false);
});
