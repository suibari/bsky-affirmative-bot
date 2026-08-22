import assert from "node:assert/strict";
import test from "node:test";
import {
  botMemoryContentHash,
  dailyPlanImpressionCooldownCondition,
  formatReactionMemoryContent,
  isBotMemorySourceType,
  isBotMemoryImpressionSourceType,
  mergeBotMemoryRanks,
  shouldRememberAffirmedPost,
  shouldRememberBskyLike,
  selectReplyMemoryContext,
} from "../src/botMemory.js";
import { bot_memory_impressions, db } from "../src/db.js";

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

test("Bluesky like memory is subscriber-only", () => {
  assert.equal(shouldRememberBskyLike(true), true);
  assert.equal(shouldRememberBskyLike(false), false);
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

test("daily plan theme memory includes public Bsky replies regardless of subscription", () => {
  assert.equal(isBotMemoryImpressionSourceType("bsky_received_reply"), true);
  assert.equal(isBotMemoryImpressionSourceType("nagi_received_reply"), true);
  assert.equal(isBotMemoryImpressionSourceType("youtube_live_comment"), true);
  assert.equal(isBotMemoryImpressionSourceType("bsky_received_like"), false);
});

test("daily plan theme cooldown encodes Date as a timestamp string", () => {
  const cooldown = new Date("2026-08-08T00:10:54.434Z");
  const query = db
    .select({ id: bot_memory_impressions.id })
    .from(bot_memory_impressions)
    .where(dailyPlanImpressionCooldownCondition(cooldown))
    .toSQL();

  assert.deepEqual(query.params, [cooldown.toISOString()]);
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

test("reply context uses stored rows without re-embedding candidates", () => {
  const ownLexical = { ...row(10), content: "本人の語彙一致", lexicalRank: 1, relevance: 0.01 };
  const friendLexical = { ...row(11), lexicalRank: 1, relevance: 0.01 };
  const friendSemantic = { ...row(12), semanticRank: 1, relevance: 0.02 };
  const selected = selectReplyMemoryContext(
    [ownLexical],
    [friendLexical, friendSemantic],
  );
  assert.deepEqual(selected.relatedPosts, ["本人の語彙一致"]);
  assert.equal(selected.friendMemory?.id, 12);
});

test("reply friend candidate excludes bot authors and lexical-only fallback", () => {
  const lexical = { ...row(20), authorId: "did:user", lexicalRank: 1, relevance: 0.01 };
  const bot = { ...row(21), authorId: "did:bot", semanticRank: 1, relevance: 0.02 };
  const selected = selectReplyMemoryContext([], [lexical, bot], ["did:bot"]);
  assert.equal(selected.friendMemory, undefined);
});
