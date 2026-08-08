import assert from "node:assert/strict";
import test from "node:test";
import {
  emojiAssetHeaders,
  emojiAssetNoStoreHeaders,
} from "../src/util/emojiAssetHeaders.js";

test("prevents transient emoji asset failures from being cached", () => {
  assert.deepEqual(emojiAssetNoStoreHeaders(), {
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store",
  });
});

test("marks a CID-fixed emoji asset as public and immutable for browsers and CDNs", () => {
  assert.deepEqual(emojiAssetHeaders("image/webp", 123), {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=31536000, immutable",
    "CDN-Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": "image/webp",
    "Content-Length": "123",
    "X-Content-Type-Options": "nosniff",
  });
});

test("omits content length while a PDS blob is streamed", () => {
  assert.equal("Content-Length" in emojiAssetHeaders("image/png"), false);
});
