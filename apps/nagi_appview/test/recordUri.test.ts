import assert from "node:assert/strict";
import test from "node:test";
import { parseRecordUri } from "../src/ingest/recordUri.js";

test("parses an owned AT record URI", () => {
  assert.deepEqual(
    parseRecordUri("at://did:plc:abc/com.suibari.nagi.post/3mtest"),
    {
      did: "did:plc:abc",
      collection: "com.suibari.nagi.post",
      rkey: "3mtest",
    },
  );
});

test("rejects malformed or non-DID record URIs", () => {
  assert.equal(parseRecordUri("https://example.com/post"), null);
  assert.equal(parseRecordUri("at://handle.example/post/rkey"), null);
  assert.equal(parseRecordUri("at://did:plc:abc/post/rkey/extra"), null);
});
