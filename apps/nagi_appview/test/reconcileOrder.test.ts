import assert from "node:assert/strict";
import test from "node:test";
import { reconciledIndexedAt } from "../src/ingest/reconcileOrder.js";

test("reconciledIndexedAt uses the original record time for historical records", () => {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date("2026-07-27T00:00:00.000Z");

  assert.equal(
    reconciledIndexedAt(createdAt, now).toISOString(),
    createdAt.toISOString(),
  );
});

test("reconciledIndexedAt clamps future record times to now", () => {
  const createdAt = new Date("2027-01-01T00:00:00.000Z");
  const now = new Date("2026-07-27T00:00:00.000Z");

  assert.equal(
    reconciledIndexedAt(createdAt, now).toISOString(),
    now.toISOString(),
  );
});
