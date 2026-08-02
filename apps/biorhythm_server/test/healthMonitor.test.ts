import assert from "node:assert/strict";
import test from "node:test";
import { servicePart, upstreamPart, type HealthPart } from "../src/healthMonitor.js";

const now = () => new Date().toISOString();

test("サービスはプロセスとJetstream接続の両方が正常なときだけok", () => {
  const okAt = now();
  assert.equal(
    servicePart(
      "Nagi AppView",
      { at: okAt, lastOkAt: okAt },
      { at: okAt, lastOkAt: okAt },
    ).state,
    "ok",
  );

  assert.equal(
    servicePart(
      "Nagi AppView",
      { at: okAt, lastOkAt: okAt },
      {
        at: okAt,
        lastOkAt: new Date(Date.now() - 1_000).toISOString(),
        lastErrorAt: okAt,
        lastError: "connection closed",
      },
    ).state,
    "down",
  );
});

test("上流は1接続でも生きていればok、全接続断でdown", () => {
  const part = (state: HealthPart["state"]): HealthPart => ({ name: state, state });
  assert.equal(upstreamPart([part("down"), part("ok"), part("down")]).state, "ok");
  assert.equal(upstreamPart([part("down"), part("down"), part("down")]).state, "down");
});
