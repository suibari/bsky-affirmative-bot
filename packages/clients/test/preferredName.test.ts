import assert from "node:assert/strict";
import test from "node:test";
import { loadPreferredName, withPreferredName } from "../src/preferredName.js";

const userinfo = {
  follower: {
    did: "did:plc:test",
    handle: "test.example",
    displayName: "表示名",
  },
  langStr: "日本語" as const,
};

test("all features can load a preferred name through one shared entry point", async () => {
  const result = await loadPreferredName("did:plc:test", async (did) => {
    assert.equal(did, "did:plc:test");
    return "共通名";
  });
  assert.equal(result, "共通名");
});

test("saved preferred name is injected without changing the display name", async () => {
  const result = await withPreferredName(userinfo, async (did) => {
    assert.equal(did, "did:plc:test");
    return "呼んでほしい名前";
  });
  assert.equal(result.preferredName, "呼んでほしい名前");
  assert.equal(result.follower.displayName, "表示名");
});

test("an existing preferred name is preserved without another lookup", async () => {
  let calls = 0;
  const result = await withPreferredName(
    { ...userinfo, preferredName: "既存名" },
    async () => {
      calls += 1;
      return "上書き名";
    },
  );
  assert.equal(result.preferredName, "既存名");
  assert.equal(calls, 0);
});

test("missing preference remains null so addressName can fall back", async () => {
  const result = await withPreferredName(userinfo, async () => null);
  assert.equal(result.preferredName, null);
});
