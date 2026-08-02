import assert from "node:assert/strict";
import test from "node:test";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import { validateRecord } from "../src/ingest/validateRecord.js";
import { diaryView } from "../src/queries/diaries.js";

const diaryRecord = (extra: Record<string, unknown> = {}) => ({
  $type: NAGI.diary,
  subject: "did:plc:alice",
  date: "2026-08-02",
  text: "今日の日記",
  createdAt: "2026-08-02T13:00:00.000Z",
  ...extra,
});

test("validates legacy and activity diary records", () => {
  assert.equal(validateRecord(NAGI.diary, diaryRecord()), true);
  assert.equal(
    validateRecord(NAGI.diary, diaryRecord({ emoji: "🌱", postCount: 3 })),
    true,
  );
  assert.equal(
    validateRecord(NAGI.diary, diaryRecord({ emoji: "👩‍💻", postCount: 1 })),
    true,
  );
});

test("rejects multiple emoji and invalid post counts", () => {
  assert.equal(
    validateRecord(NAGI.diary, diaryRecord({ emoji: "🌱✨", postCount: 2 })),
    false,
  );
  for (const postCount of [0, -1, 1.5, "2"]) {
    assert.equal(
      validateRecord(NAGI.diary, diaryRecord({ emoji: "🌱", postCount })),
      false,
    );
  }
});

test("diary view exposes activity fields and omits null legacy values", () => {
  const base = {
    uri: "at://did:plc:bot/com.suibari.nagi.diary/alice-2026-08-02",
    cid: "bafyreidiary",
    did: "did:plc:bot",
    subjectDid: "did:plc:alice",
    diaryDate: "2026-08-02",
    text: "今日の日記",
    titleJa: null,
    titleEn: null,
    langs: null,
    recordCreatedAt: new Date("2026-08-02T13:00:00.000Z"),
    indexedAt: new Date("2026-08-02T13:00:01.000Z"),
  };

  assert.deepEqual(diaryView({ ...base, emoji: null, postCount: null }), {
    uri: base.uri,
    cid: base.cid,
    subject: base.subjectDid,
    date: base.diaryDate,
    text: base.text,
    titleJa: undefined,
    titleEn: undefined,
    emoji: undefined,
    postCount: undefined,
    langs: undefined,
    createdAt: base.recordCreatedAt.toISOString(),
    indexedAt: base.indexedAt.toISOString(),
  });

  const view = diaryView({ ...base, emoji: "🌱", postCount: 4 });
  assert.equal(view.emoji, "🌱");
  assert.equal(view.postCount, 4);
});
