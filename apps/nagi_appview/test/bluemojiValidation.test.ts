import assert from "node:assert/strict";
import test from "node:test";
import { BLUEMOJI_ITEM } from "@bsky-affirmative-bot/nagi-lexicon";
import {
  normalizeBluemojiFormats,
  validateRecord,
} from "../src/ingest/validateRecord.js";

const blob = (mimeType: string, size = 100) => ({
  $type: "blob",
  ref: { $link: "bafyvalidcid" },
  mimeType,
  size,
});
const record = (formats: Record<string, unknown>, fallbackText = "◌") => ({
  $type: BLUEMOJI_ITEM,
  name: ":party:",
  createdAt: "2026-07-30T00:00:00.000Z",
  fallbackText,
  formats: { $type: `${BLUEMOJI_ITEM}#formats_v0`, ...formats },
});

test("accepts every pinned formats_v0 media representation", () => {
  const cases = [
    { lottie: { $bytes: Buffer.from("zip").toString("base64") } },
    { apng_128: { $bytes: Buffer.from("apng").toString("base64") } },
    { gif_128: blob("image/gif") },
    { webp_128: blob("image/webp") },
    { png_128: blob("image/png") },
    { png_128: blob("application/octet-stream") },
    { original: blob("image/svg+xml", 1_000_000) },
    { original: blob("application/lottie+zip", 1_000_000) },
  ];
  for (const formats of cases) {
    assert.equal(validateRecord(BLUEMOJI_ITEM, record(formats)), true);
    assert.ok(normalizeBluemojiFormats(record(formats).formats));
  }
});

test("rejects the former Nagi formats_v1 and invalid fallback text", () => {
  const formatsV1 = record({ png_128: blob("image/png") });
  formatsV1.formats.$type = `${BLUEMOJI_ITEM}#formats_v1`;
  assert.equal(validateRecord(BLUEMOJI_ITEM, formatsV1), false);
  assert.equal(
    validateRecord(
      BLUEMOJI_ITEM,
      record({ png_128: blob("image/png") }, ":party:"),
    ),
    false,
  );
  assert.equal(
    validateRecord(BLUEMOJI_ITEM, {
      ...record({ png_128: blob("image/png") }),
      copyOf: "not-an-at-uri",
    }),
    false,
  );
});

test("uses the formats_v0 field for optimized blob media type and rejects invalid limits", () => {
  assert.equal(
    validateRecord(BLUEMOJI_ITEM, record({ png_128: blob("image/gif") })),
    true,
  );
  assert.equal(
    normalizeBluemojiFormats(record({ png_128: blob("image/gif") }).formats)
      ?.asset.mediaType,
    "image/png",
  );
  assert.equal(
    validateRecord(BLUEMOJI_ITEM, record({ png_128: blob("", 100) })),
    false,
  );
  assert.equal(
    validateRecord(
      BLUEMOJI_ITEM,
      record({ original: blob("image/png", 1_000_001) }),
    ),
    false,
  );
  assert.equal(
    validateRecord(
      BLUEMOJI_ITEM,
      record({ lottie: { $bytes: Buffer.alloc(65_537).toString("base64") } }),
    ),
    false,
  );
  assert.equal(
    validateRecord(
      BLUEMOJI_ITEM,
      record({ apng_128: { $bytes: "not base64" } }),
    ),
    false,
  );
});
