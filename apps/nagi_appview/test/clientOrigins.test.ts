import assert from "node:assert/strict";
import test from "node:test";
import { parseClientOrigins } from "../src/clientOrigins.js";

test("parses production and Vercel Preview origins", () => {
  assert.deepEqual(
    parseClientOrigins(
      "https://nagi.suibari.com, https://nagi-client-git-develop-suibaris-projects.vercel.app",
    ),
    [
      "https://nagi.suibari.com",
      "https://nagi-client-git-develop-suibaris-projects.vercel.app",
    ],
  );
});

test("trims, ignores empty entries, and removes duplicates", () => {
  assert.deepEqual(
    parseClientOrigins(" https://nagi.suibari.com, ,https://nagi.suibari.com "),
    ["https://nagi.suibari.com"],
  );
});

test("allows all loopback host forms with the configured port", () => {
  assert.deepEqual(parseClientOrigins("http://localhost:5173"), [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://[::1]:5173",
  ]);
});

test("rejects paths and malformed origins", () => {
  for (const value of [
    "https://nagi.suibari.com/path",
    "https://nagi.suibari.com/",
    "https://user@example.com",
    "not-a-url",
  ]) {
    assert.throws(() => parseClientOrigins(value), /NAGI_CLIENT_ORIGIN contains an invalid origin/);
  }
});

test("rejects an empty origin list", () => {
  assert.throws(() => parseClientOrigins(" , "), /must contain at least one origin/);
});
