/**
 * 指定ユーザーの既存Nagi日記について、本文などを保ったままpostCountだけを復元する。
 * 件数範囲は通常の日記生成と同じく、日記レコードのcreatedAtまでの直近24時間。
 *
 * Preview (default):
 *   pnpm --filter nagi-bot-server diary:activity:backfill
 * Apply:
 *   pnpm --filter nagi-bot-server diary:activity:backfill --apply
 * Another user:
 *   pnpm --filter nagi-bot-server diary:activity:backfill did:plc:... [--apply]
 * All users:
 *   pnpm --filter nagi-bot-server diary:activity:backfill --all [--apply]
 */
import assert from "node:assert/strict";
import { and, count, eq, gte, isNull, lte } from "drizzle-orm";
import { db, nagiPosts } from "@bsky-affirmative-bot/database";
import { NAGI, type NagiDiary } from "@bsky-affirmative-bot/nagi-lexicon";
import { agent, initAgent } from "../src/agent.js";

const DEFAULT_TARGET_DID = "did:plc:uixgxpiqf4i63p6rgpu7ytmx";
const DAY_MS = 24 * 60 * 60 * 1000;

type DiaryRecordRow = {
  uri: string;
  cid: string;
  value: NagiDiary;
};

type UserStats = {
  previewed: number;
  updated: number;
  failed: number;
};

function withoutPostCount(value: NagiDiary): Omit<NagiDiary, "postCount"> {
  const { postCount: _postCount, ...rest } = value;
  return rest;
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const all = args.includes("--all");
const unknownOptions = args.filter(
  (arg) => arg.startsWith("--") && arg !== "--apply" && arg !== "--all",
);
const positional = args.filter((arg) => !arg.startsWith("--"));

if (
  unknownOptions.length ||
  positional.length > 1 ||
  (all && positional.length)
) {
  console.error("usage: diary:activity:backfill [did | --all] [--apply]");
  process.exit(1);
}

const targetDid = all ? undefined : (positional[0] ?? DEFAULT_TARGET_DID);
if (targetDid && !/^did:(plc|web):/.test(targetDid)) {
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
    if (all || value.subject === targetDid) {
      records.push({ uri: row.uri, cid: row.cid, value });
    }
  }
  cursor = response.data.cursor;
} while (cursor);

records.sort(
  (a, b) =>
    a.value.subject.localeCompare(b.value.subject) ||
    a.value.date.localeCompare(b.value.date),
);
const scopeLabel = all ? "all users" : targetDid;
console.log(
  `${apply ? "APPLY" : "PREVIEW"}: ${records.length} diaries for ${scopeLabel}`,
);

let updated = 0;
let failed = 0;
const userStats = new Map<string, UserStats>();
for (const [index, row] of records.entries()) {
  const subjectDid = row.value.subject;
  const stats = userStats.get(subjectDid) ?? {
    previewed: 0,
    updated: 0,
    failed: 0,
  };
  userStats.set(subjectDid, stats);
  try {
    if (!/^did:(plc|web):/.test(subjectDid)) {
      throw new Error(`invalid diary subject DID: ${subjectDid}`);
    }
    const windowEnd = new Date(row.value.createdAt);
    if (Number.isNaN(windowEnd.getTime())) {
      throw new Error(`invalid diary createdAt: ${row.value.createdAt}`);
    }
    const windowStart = new Date(windowEnd.getTime() - DAY_MS);
    const [countRow] = await db
      .select({ postCount: count() })
      .from(nagiPosts)
      .where(
        and(
          eq(nagiPosts.did, subjectDid),
          isNull(nagiPosts.deletedAt),
          gte(nagiPosts.recordCreatedAt, windowStart),
          lte(nagiPosts.recordCreatedAt, windowEnd),
        ),
      );
    const postCount = Number(countRow?.postCount ?? 0);
    if (postCount < 1) {
      throw new Error("no surviving posts found in the diary's 24-hour window");
    }

    const before = row.value.postCount ?? "(none)";
    if (apply) {
      const rkey = row.uri.split("/").pop();
      if (!rkey) throw new Error(`could not extract rkey from ${row.uri}`);
      await agent.api.com.atproto.repo.putRecord({
        repo: botDid,
        collection: NAGI.diary,
        rkey,
        validate: false,
        swapRecord: row.cid,
        record: { ...row.value, postCount },
      } as any);
      const persisted = await agent.api.com.atproto.repo.getRecord({
        repo: botDid,
        collection: NAGI.diary,
        rkey,
      });
      const persistedValue = persisted.data.value as NagiDiary;
      assert.equal(persistedValue.postCount, postCount);
      assert.deepEqual(
        withoutPostCount(persistedValue),
        withoutPostCount(row.value),
        "a field other than postCount changed",
      );
    }

    updated += 1;
    if (apply) stats.updated += 1;
    else stats.previewed += 1;
    const rowLabel = all ? `${subjectDid} ${row.value.date}` : row.value.date;
    console.log(
      `[${index + 1}/${records.length}] ${rowLabel}: ${before} -> ${postCount}${apply ? " (verified; other fields unchanged)" : ""}`,
    );
  } catch (error) {
    failed += 1;
    stats.failed += 1;
    const rowLabel = all ? `${subjectDid} ${row.value.date}` : row.value.date;
    console.error(
      `[${index + 1}/${records.length}] ${rowLabel}: FAILED`,
      error,
    );
  }
}

if (all) {
  console.log("per-user summary:");
  for (const [did, stats] of [...userStats].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(
      `- ${did}: ${apply ? stats.updated : stats.previewed} ${apply ? "updated" : "previewed"}, ${stats.failed} failed`,
    );
  }
}

console.log(
  `done: ${updated} ${apply ? "updated" : "previewed"}, ${failed} failed`,
);
if (!apply && records.length) {
  console.log(
    "No records were changed. Re-run with --apply after reviewing the counts.",
  );
}
process.exit(failed ? 1 : 0);
