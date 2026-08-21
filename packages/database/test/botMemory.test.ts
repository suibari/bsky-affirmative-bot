import assert from "node:assert/strict";
import test from "node:test";
import {
  botMemoryContentHash,
  formatReactionMemoryContent,
  isBotMemorySourceType,
  mergeBotMemoryRanks,
  shouldRememberAffirmedPost,
} from "../src/botMemory.js";

const row = (id: number, occurredAt = new Date("2026-08-21T00:00:00Z")) => ({
  id,
  sourceType: "bsky_affirmed_post" as const,
  sourceId: String(id),
  sourceUri: `at://example/${id}`,
  authorId: `did:example:${id}`,
  content: `memory ${id}`,
  botResponse: null,
  occurredAt,
  affirmationScore: null,
  metadata: null,
});

test("memory content hash is deterministic and content-sensitive", () => {
  assert.equal(botMemoryContentHash("same"), botMemoryContentHash("same"));
  assert.notEqual(botMemoryContentHash("same"), botMemoryContentHash("different"));
});

test("source type guard rejects unknown values", () => {
  assert.equal(isBotMemorySourceType("nagi_affirmed_post"), true);
  assert.equal(isBotMemorySourceType("nagi_received_reaction"), true);
  assert.equal(isBotMemorySourceType("kossori"), false);
});

test("affirmed post memory keeps Nagi AI posts and subscriber-only Bluesky AI posts", () => {
  const base = { aiReplyPosted: true, isTopLevel: true, isPublic: true };
  assert.equal(shouldRememberAffirmedPost({ ...base, surface: "nagi" }), true);
  assert.equal(shouldRememberAffirmedPost({ ...base, surface: "bsky", isSubscriber: true }), true);
  assert.equal(shouldRememberAffirmedPost({ ...base, surface: "bsky", isSubscriber: false }), false);
  assert.equal(shouldRememberAffirmedPost({ ...base, surface: "nagi", aiReplyPosted: false }), false);
  assert.equal(shouldRememberAffirmedPost({ ...base, surface: "nagi", isPublic: false }), false);
});

test("reaction memory includes custom emoji meaning", () => {
  assert.equal(
    formatReactionMemoryContent("今日もうれしい", ":party_blob: 喜んで跳ねる猫"),
    "botたんの投稿「今日もうれしい」へのリアクション :party_blob: 喜んで跳ねる猫",
  );
});

test("RRF merges duplicates and keeps candidates from both rankings", () => {
  const result = mergeBotMemoryRanks([row(1), row(2)], [row(2), row(3)], 3);
  assert.deepEqual(result.map((item) => item.id), [2, 1, 3]);
  assert.equal(result[0].semanticRank, 2);
  assert.equal(result[0].lexicalRank, 1);
});

test("RRF uses recency as a deterministic tie breaker", () => {
  const result = mergeBotMemoryRanks(
    [row(1, new Date("2026-08-20T00:00:00Z")), row(2)],
    [],
    2,
    60,
  );
  assert.deepEqual(result.map((item) => item.id), [1, 2]);
});
