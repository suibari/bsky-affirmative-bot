/**
 * 指定ユーザーの既存Nagi日記について、本文などを保ったまま絵文字だけを再生成する。
 *
 * Preview (default):
 *   pnpm --filter nagi-bot-server diary:emoji:backfill
 * Apply:
 *   pnpm --filter nagi-bot-server diary:emoji:backfill --apply
 * Another user:
 *   pnpm --filter nagi-bot-server diary:emoji:backfill did:plc:... [--apply]
 */
import retry from "async-retry";
import assert from "node:assert/strict";
import { generateDiaryEmojis } from "@bsky-affirmative-bot/bot-brain";
import { trackedPutRecord } from "@bsky-affirmative-bot/clients";
import { NAGI, type NagiDiary } from "@bsky-affirmative-bot/nagi-lexicon";
import { agent, initAgent } from "../src/agent.js";

const DEFAULT_TARGET_DID = "did:plc:uixgxpiqf4i63p6rgpu7ytmx";

type DiaryRecordRow = {
  uri: string;
  cid: string;
  value: NagiDiary;
};

function withoutEmoji(value: NagiDiary): Omit<NagiDiary, "emoji"> {
  const { emoji: _emoji, ...rest } = value;
  return rest;
}

const daysBetween = (earlier: string, later: string) =>
  (Date.parse(`${later}T00:00:00.000Z`) -
    Date.parse(`${earlier}T00:00:00.000Z`)) /
  (24 * 60 * 60 * 1000);

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const unknownOptions = args.filter(
  (arg) => arg.startsWith("--") && arg !== "--apply",
);
const positional = args.filter((arg) => !arg.startsWith("--"));

if (unknownOptions.length || positional.length > 1) {
  console.error("usage: diary:emoji:backfill [did] [--apply]");
  process.exit(1);
}

const targetDid = positional[0] ?? DEFAULT_TARGET_DID;
if (!/^did:(plc|web):/.test(targetDid)) {
  console.error(`invalid DID: ${targetDid}`);
  process.exit(1);
}

const botDid = process.env.NAGI_BOT_DID;
if (!botDid) {
  console.error("NAGI_BOT_DID is required");
  process.exit(1);
}

await initAgent();

const records: DiaryRecordRow[] = [];
let cursor: string | undefined;
do {
  const response = await agent.api.com.atproto.repo.listRecords({
    repo: botDid,
    collection: NAGI.diary,
    limit: 100,
    ...(cursor ? { cursor } : {}),
  });
  for (const row of response.data.records) {
    const value = row.value as unknown as NagiDiary;
    if (value.subject === targetDid) {
      records.push({ uri: row.uri, cid: row.cid, value });
    }
  }
  cursor = response.data.cursor;
} while (cursor);

records.sort((a, b) => a.value.date.localeCompare(b.value.date));
console.log(
  `${apply ? "APPLY" : "PREVIEW"}: ${records.length} diaries for ${targetDid}`,
);

let updated = 0;
let failed = 0;
const generatedHistory: Array<{ date: string; emoji: string }> = [];
for (const [index, row] of records.entries()) {
  try {
    const recentEmojis = generatedHistory.filter((entry) => {
      const age = daysBetween(entry.date, row.value.date);
      return age >= 1 && age <= 3;
    });
    const emoji = await retry(
      () =>
        generateDiaryEmojis({
          date: row.value.date,
          text: row.value.text,
          titleJa: row.value.titleJa,
          titleEn: row.value.titleEn,
          recentEmojis,
        }),
      {
        retries: 2,
        onRetry: (error, attempt) => {
          console.warn(
            `[${row.value.date}] emoji retry ${attempt}/2: ${String(error)}`,
          );
        },
      },
    );
    const before = row.value.emoji ?? "(none)";

    if (apply) {
      const rkey = row.uri.split("/").pop();
      if (!rkey) throw new Error(`could not extract rkey from ${row.uri}`);
      await trackedPutRecord(agent, {
        repo: botDid,
        collection: NAGI.diary,
        rkey,
        validate: false,
        swapRecord: row.cid,
        record: { ...row.value, emoji },
      } as any, "nagi.diary.emoji-backfill");
      const persisted = await agent.api.com.atproto.repo.getRecord({
        repo: botDid,
        collection: NAGI.diary,
        rkey,
      });
      const persistedValue = persisted.data.value as NagiDiary;
      const persistedEmoji = persistedValue.emoji;
      if (persistedEmoji !== emoji) {
        throw new Error(
          `read-after-write mismatch: expected ${emoji}, got ${persistedEmoji}`,
        );
      }
      assert.deepEqual(
        withoutEmoji(persistedValue),
        withoutEmoji(row.value),
        "a field other than emoji changed",
      );
    }

    updated += 1;
    generatedHistory.push({ date: row.value.date, emoji });
    console.log(
      `[${index + 1}/${records.length}] ${row.value.date}: ${before} -> ${emoji}${apply ? " (verified; other fields unchanged)" : ""}`,
    );
  } catch (error) {
    failed += 1;
    console.error(
      `[${index + 1}/${records.length}] ${row.value.date}: FAILED`,
      error,
    );
  }
}

console.log(
  `done: ${updated} ${apply ? "updated" : "previewed"}, ${failed} failed`,
);
if (!apply && records.length) {
  console.log(
    "No records were changed. Re-run with --apply after the AppView deployment accepts 3 emoji.",
  );
}
process.exit(failed ? 1 : 0);
