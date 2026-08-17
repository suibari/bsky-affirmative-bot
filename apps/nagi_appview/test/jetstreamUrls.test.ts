import assert from "node:assert/strict";
import test from "node:test";
import { parseJetstreamUrls } from "../src/jetstreamUrls.js";

test("parses a single endpoint", () => {
  assert.deepEqual(parseJetstreamUrls("wss://jetstream1.us-east.bsky.network/subscribe"), [
    "wss://jetstream1.us-east.bsky.network/subscribe",
  ]);
});

test("keeps the configured order so the first candidate stays preferred", () => {
  assert.deepEqual(
    parseJetstreamUrls(
      "ws://192.168.1.200:8000, wss://jetstream1.us-east.bsky.network/subscribe",
    ),
    ["ws://192.168.1.200:8000/", "wss://jetstream1.us-east.bsky.network/subscribe"],
  );
});

test("normalizes http/https to ws/wss so existing settings keep working", () => {
  assert.deepEqual(parseJetstreamUrls("http://192.168.1.200:8000"), [
    "ws://192.168.1.200:8000/",
  ]);
  assert.deepEqual(parseJetstreamUrls("https://example.com/subscribe"), [
    "wss://example.com/subscribe",
  ]);
});

test("trims, ignores empty entries, and removes duplicates", () => {
  assert.deepEqual(
    parseJetstreamUrls(" ws://localhost:8000/, ,ws://localhost:8000/ "),
    ["ws://localhost:8000/"],
  );
});

test("rejects unusable values instead of starting with a dead endpoint", () => {
  assert.throws(() => parseJetstreamUrls("not a url"), /invalid URL/);
  assert.throws(() => parseJetstreamUrls("ftp://example.com"), /ws, wss, http or https/);
  assert.throws(() => parseJetstreamUrls(" , "), /at least one URL/);
});
