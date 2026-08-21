import assert from "node:assert/strict";
import test from "node:test";
import {
  isBotMemoryAuthorized,
  serializeBotMemorySearchResult,
  validateBotMemorySearchBody,
} from "../src/botMemoryRouter.js";
import { processBotMemoryEmbeddingBatch } from "../src/botMemoryEmbeddingWorker.js";

test("internal memory auth requires exact bearer secret", () => {
  assert.equal(isBotMemoryAuthorized("Bearer secret", "secret"), true);
  assert.equal(isBotMemoryAuthorized("Bearer wrong", "secret"), false);
  assert.equal(isBotMemoryAuthorized(undefined, "secret"), false);
  assert.equal(isBotMemoryAuthorized("Bearer secret", undefined), false);
});

test("internal API response does not expose author or source identifiers", () => {
  const serialized = serializeBotMemorySearchResult({
    id: 1,
    sourceType: "nagi_received_reply",
    sourceId: "private-source-id",
    sourceUri: "at://did:plc:author/com.suibari.nagi.post/one",
    authorId: "did:plc:author",
    content: "本文",
    botResponse: null,
    occurredAt: new Date("2026-08-21T00:00:00Z"),
    affirmationScore: null,
    metadata: { safe: true },
    relevance: 0.1,
  });
  assert.deepEqual(Object.keys(serialized), [
    "id", "source", "content", "occurredAt", "metadata", "relevance",
  ]);
  assert.equal(serialized.source, "nagi_received_reply");
});

test("search body validates purpose, sources, and query length", () => {
  assert.deepEqual(validateBotMemorySearchBody({
    query: "  今日の挑戦  ",
    purpose: "live_filler",
    sources: ["nagi_affirmed_post"],
  }), {
    query: "今日の挑戦",
    purpose: "live_filler",
    sources: ["nagi_affirmed_post"],
  });
  assert.throws(() => validateBotMemorySearchBody({ query: "", purpose: "live_filler" }));
  assert.throws(() => validateBotMemorySearchBody({ query: "ok", purpose: "unknown" }));
  assert.throws(() => validateBotMemorySearchBody({
    query: "ok",
    purpose: "live_filler",
    sources: ["kossori"],
  }));
});

test("embedding batch saves successful rows and leaves failed rows pending", async () => {
  const saved: number[] = [];
  const count = await processBotMemoryEmbeddingBatch({
    fetchPending: async () => [
      { id: 1, content: "first", contentHash: "a" },
      { id: 2, content: "second", contentHash: "b" },
    ],
    embed: async () => [Array(1024).fill(0.1), null],
    save: async (id) => {
      saved.push(id);
      return true;
    },
  });
  assert.equal(count, 1);
  assert.deepEqual(saved, [1]);
});
