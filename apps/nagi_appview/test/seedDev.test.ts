import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeDevDatabase } from "../scripts/seedDevSafety.js";

test("development seed accepts only the loopback nagi_dev database", () => {
  const target = assertSafeDevDatabase({
    NODE_ENV: "development",
    DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5433/nagi_dev",
  });
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.pathname, "/nagi_dev");
});

for (const [name, env] of [
  [
    "production mode",
    {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5433/nagi_dev",
    },
  ],
  [
    "remote host",
    {
      NODE_ENV: "development",
      DATABASE_URL: "postgres://postgres:postgres@db.example.com:5432/nagi_dev",
    },
  ],
  [
    "non-development database name",
    {
      NODE_ENV: "development",
      DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5433/postgres",
    },
  ],
] as const) {
  test(`development seed rejects ${name}`, () => {
    assert.throws(() => assertSafeDevDatabase(env));
  });
}
