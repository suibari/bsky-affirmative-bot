import assert from "node:assert/strict";
import test from "node:test";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import { validateRecord } from "../src/ingest/validateRecord.js";

const channel = (pinnedPost?: unknown) => ({
  $type: NAGI.channel,
  name: "写真部",
  description: "写真を楽しむチャンネル",
  ...(pinnedPost === undefined ? {} : { pinnedPost }),
  createdAt: "2026-07-24T00:00:00.000Z",
});

test("accepts channels with or without a pinned post strong ref", () => {
  assert.equal(validateRecord(NAGI.channel, channel()), true);
  assert.equal(
    validateRecord(
      NAGI.channel,
      channel({
        uri: "at://did:plc:example/com.suibari.nagi.post/3m123",
        cid: "bafyreipost",
      }),
    ),
    true,
  );
});

test("rejects malformed pinned post refs", () => {
  assert.equal(
    validateRecord(
      NAGI.channel,
      channel({
        uri: "https://example.com/post/1",
        cid: "bafyreipost",
      }),
    ),
    false,
  );
  assert.equal(
    validateRecord(
      NAGI.channel,
      channel({
        uri: "at://did:plc:example/com.suibari.nagi.post/3m123",
        cid: 123,
      }),
    ),
    false,
  );
});
