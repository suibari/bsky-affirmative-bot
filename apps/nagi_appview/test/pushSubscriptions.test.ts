import assert from "node:assert/strict";
import test from "node:test";
import { hashPushCapability } from "../src/queries/pushSubscriptions.js";

test("push capability is stored only as a deterministic SHA-256 hash", () => {
  const capability = "JYV5uMq3SNE5GttjOVhhoYftmBIlRKKkNyRCI9mkoX4";
  const hash = hashPushCapability(capability);
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, capability);
  assert.equal(hashPushCapability(capability), hash);
  assert.notEqual(hashPushCapability(`${capability}x`), hash);
});
