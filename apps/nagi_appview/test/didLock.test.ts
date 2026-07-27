import assert from "node:assert/strict";
import test from "node:test";
import { withDidLock } from "../src/ingest/didLock.js";

test("serializes work for one DID while allowing different DIDs", async () => {
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const first = withDidLock("did:plc:a", async () => {
    order.push("a1:start");
    await gate;
    order.push("a1:end");
  });
  const second = withDidLock("did:plc:a", async () => {
    order.push("a2");
  });
  const other = withDidLock("did:plc:b", async () => {
    order.push("b");
  });

  await other;
  release();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["a1:start", "b", "a1:end", "a2"]);
});
