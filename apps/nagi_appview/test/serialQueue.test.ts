import assert from "node:assert/strict";
import test from "node:test";
import { SerialRetryQueue } from "../src/ingest/serialQueue.js";

test("processes events in arrival order", async () => {
  const handled: number[] = [];
  const queue = new SerialRetryQueue<number>(
    async (value) => {
      await Promise.resolve();
      handled.push(value);
    },
    () => assert.fail("unexpected retry"),
  );
  queue.enqueue(1);
  queue.enqueue(2);
  queue.enqueue(3);
  await queue.close();
  assert.deepEqual(handled, [1, 2, 3]);
  assert.equal(queue.size, 0);
});

test("blocks later events until a failed event succeeds", async () => {
  const handled: string[] = [];
  const retries: number[] = [];
  let firstAttempts = 0;
  const queue = new SerialRetryQueue<string>(
    async (value) => {
      if (value === "first" && firstAttempts++ === 0)
        throw new Error("temporary");
      handled.push(value);
    },
    ({ attempt }) => retries.push(attempt),
    async () => undefined,
  );
  queue.enqueue("first");
  queue.enqueue("second");
  await queue.close();
  assert.deepEqual(retries, [1]);
  assert.deepEqual(handled, ["first", "second"]);
});

test("rejects new events after close starts", async () => {
  const queue = new SerialRetryQueue<number>(
    async () => undefined,
    () => undefined,
  );
  await queue.close();
  assert.equal(queue.enqueue(1), false);
});
