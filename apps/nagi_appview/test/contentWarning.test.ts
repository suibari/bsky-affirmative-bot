import assert from "node:assert/strict";
import test from "node:test";
import {
  hasContentWarning,
  parseContentWarning,
} from "../src/util/contentWarning.js";
import { validateRecord } from "../src/ingest/validateRecord.js";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";

test("parses one text CW and returns inner UTF-8 byte offsets", () => {
  assert.deepEqual(parseContentWarning("前||絵文字🌱\n- 二行目||後"), {
    status: "valid",
    range: { byteStart: 5, byteEnd: 30 },
    markerStart: 1,
    markerEnd: 14,
  });
});

test("ignores escaped bars and bars inside inline code", () => {
  assert.deepEqual(parseContentWarning(String.raw`\|\|literal\|\|`), {
    status: "none",
  });
  assert.deepEqual(parseContentWarning("`a || b`"), { status: "none" });
});

test("accepts a range spanning Markdown links, lists, and quotes", () => {
  const text =
    "before ||[link](https://example.com)\n- list\n> quoted text|| after";
  assert.equal(parseContentWarning(text).status, "valid");
});

test("rejects malformed, empty, and multiple CW blocks", () => {
  assert.deepEqual(parseContentWarning("before ||after"), {
    status: "invalid",
    reason: "unmatched",
  });
  assert.deepEqual(parseContentWarning("||||"), {
    status: "invalid",
    reason: "empty",
  });
  assert.deepEqual(parseContentWarning("||one|| and ||two||"), {
    status: "invalid",
    reason: "multiple",
  });
  assert.deepEqual(parseContentWarning("||outer ||inner|| outer||"), {
    status: "invalid",
    reason: "multiple",
  });
  assert.deepEqual(parseContentWarning("|| \n\t ||"), {
    status: "invalid",
    reason: "empty",
  });
  assert.equal(hasContentWarning("||one||"), true);
  assert.equal(hasContentWarning("plain"), false);
});

test("validates optional permanent and per-image CW booleans", () => {
  const record = {
    $type: NAGI.post,
    text: "||warning||",
    createdAt: "2026-07-29T00:00:00.000Z",
    cwRestricted: true,
    embed: {
      $type: `${NAGI.post}#images`,
      images: [
        {
          image: {
            ref: { $link: "bafkreiexample" },
            mimeType: "image/png",
            size: 100,
          },
          alt: "description",
          contentWarning: true,
        },
      ],
    },
  };
  assert.equal(validateRecord(NAGI.post, record), true);
  assert.equal(
    validateRecord(NAGI.post, { ...record, cwRestricted: "true" }),
    false,
  );
  assert.equal(
    validateRecord(NAGI.post, {
      ...record,
      embed: {
        ...record.embed,
        images: [{ ...record.embed.images[0], contentWarning: "true" }],
      },
    }),
    false,
  );
});
