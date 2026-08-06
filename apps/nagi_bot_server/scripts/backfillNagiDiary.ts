/**
 * 指定した過去日のNagi日記を、書けていないユーザーぶんだけ後から生成する。
 *
 * 定時実行（ローカル22時）が Gemini の 503 やプロセス再起動で落ちた日を回収するためのもの。
 * 材料はその日のローカル22時までの24時間ぶんの投稿で、定時実行と同じ窓になる。
 * 日記が既にある (subject, date) は processNagiDiary 側の存在チェックで飛ばすので、
 * 何度流しても二重生成しない。
 *
 * Preview（対象を数えるだけ。Gemini は呼ばない）:
 *   pnpm --filter nagi-bot-server diary:backfill --date=2026-08-05
 * Apply:
 *   pnpm --filter nagi-bot-server diary:backfill --date=2026-08-05 --apply
 * ユーザーを絞る:
 *   pnpm --filter nagi-bot-server diary:backfill --date=2026-08-05 did:plc:xxx did:plc:yyy --apply
 * タイムゾーンを固定する（投稿の言語から推定させたくないとき）:
 *   pnpm --filter nagi-bot-server diary:backfill --date=2026-08-05 --tz=Asia/Tokyo --apply
 */
import { and, eq } from "drizzle-orm";
import { db, MemoryService, nagiDiaries } from "@bsky-affirmative-bot/database";
import { getTimezoneFromLang, localDateStr, localHourToUtc } from "@bsky-affirmative-bot/clients";
import { processNagiDiary } from "../src/NagiDiaryFeature.js";
import { initAgent } from "../src/agent.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 定時実行と同じ「ローカル22時まで」を材料の窓にする。 */
const DIARY_HOUR = 22;

// pnpm 6 までの区切り記号。今は不要だが、付けて呼ばれても落ちないよう捨てる。
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const apply = args.includes("--apply");
const date = args.find((arg) => arg.startsWith("--date="))?.slice("--date=".length);
const tzOverride = args.find((arg) => arg.startsWith("--tz="))?.slice("--tz=".length);
const dids = args.filter((arg) => !arg.startsWith("--"));
const unknown = args.filter(
  (arg) =>
    arg.startsWith("--") &&
    arg !== "--apply" &&
    !arg.startsWith("--date=") &&
    !arg.startsWith("--tz="),
);

function usage(message: string): never {
  console.error(`error: ${message}`);
  console.error(
    "usage: diary:backfill --date=YYYY-MM-DD [did:plc:... ...] [--tz=Area/City] [--apply]",
  );
  process.exit(1);
}

if (unknown.length) usage(`unknown option: ${unknown.join(", ")}`);
if (!date) usage("--date=YYYY-MM-DD is required");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) usage(`invalid --date: ${date}`);
for (const did of dids) {
  if (!/^did:(plc|web):/.test(did)) usage(`invalid DID: ${did}`);
}
if (tzOverride) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tzOverride });
  } catch {
    usage(`invalid --tz: ${tzOverride}`);
  }
}

const todayUtc = new Date().toISOString().slice(0, 10);
if (date >= todayUtc) {
  console.warn(
    `[WARN] --date=${date} は今日以降。定時実行と重なる可能性がある（生成済みなら飛ばされる）。`,
  );
}

/** そのユーザーのタイムゾーン。投稿の言語から推定する（定時実行と同じ決め方）。 */
async function resolveTimezone(did: string, until: Date): Promise<string> {
  if (tzOverride) return tzOverride;
  // 言語を拾うためだけの読み取り。窓の外の投稿は使わない。
  const posts = (
    await MemoryService.getNagiPostsSince(did, new Date(until.getTime() - DAY_MS))
  ).filter((post) => !post.recordCreatedAt || post.recordCreatedAt <= until);
  const langs = [...posts]
    .reverse()
    .find((post) => Array.isArray(post.langs) && post.langs.length)?.langs as
    | string[]
    | undefined;
  return getTimezoneFromLang(langs?.[0]);
}

async function hasDiary(did: string, diaryDate: string): Promise<boolean> {
  const rows = await db
    .select({ uri: nagiDiaries.uri })
    .from(nagiDiaries)
    .where(and(eq(nagiDiaries.subjectDid, did), eq(nagiDiaries.diaryDate, diaryDate)))
    .limit(1);
  return Boolean(rows[0]);
}

// 対象ユーザーの決定。DID 未指定なら「その日に投稿していた人」全員を候補にする。
// 候補の抽出はタイムゾーン非依存にしたいので、どのゾーンでも窓が収まる広めの範囲で引く。
let candidates = dids;
if (candidates.length === 0) {
  const botDid = process.env.NAGI_BOT_DID;
  const widest = new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS);
  candidates = (await MemoryService.getNagiActiveAuthorsSince(widest)).filter(
    (did) => did !== botDid,
  );
  console.log(`[INFO] ${date} 前後に投稿していたユーザー: ${candidates.length}`);
}

type Target = { did: string; timezone: string; until: Date; postCount: number };
const targets: Target[] = [];
let skipped = 0;

for (const did of candidates) {
  const provisionalTz = tzOverride ?? "UTC";
  // タイムゾーンを決めるには窓が要り、窓を決めるにはタイムゾーンが要る。
  // UTC の窓で言語を拾ってから、確定したタイムゾーンで窓を引き直す。
  const timezone = await resolveTimezone(did, localHourToUtc(date, DIARY_HOUR, provisionalTz));
  const until = localHourToUtc(date, DIARY_HOUR, timezone);

  if (await hasDiary(did, date)) {
    skipped += 1;
    continue;
  }

  const posts = (
    await MemoryService.getNagiPostsSince(did, new Date(until.getTime() - DAY_MS))
  ).filter((post) => !post.recordCreatedAt || post.recordCreatedAt <= until);
  if (posts.length === 0) {
    skipped += 1;
    continue;
  }

  targets.push({ did, timezone, until, postCount: posts.length });
}

console.log(
  `${apply ? "APPLY" : "PREVIEW"}: date=${date}, 生成対象 ${targets.length} 人 / 対象外 ${skipped} 人（日記あり or 投稿なし）`,
);
for (const target of targets) {
  console.log(
    `  ${target.did}  tz=${target.timezone}  posts=${target.postCount}  window=${new Date(target.until.getTime() - DAY_MS).toISOString()}..${target.until.toISOString()}`,
  );
  // 窓の位置が意図どおりか（= その日のローカル22時か）を目視できるようにする。
  if (localDateStr(target.timezone, target.until) !== date) {
    console.warn(
      `  [WARN] ${target.did}: 窓の終端がローカル ${date} に載っていない。--tz で固定するか確認すること。`,
    );
  }
}

if (!apply) {
  console.log("何も書いていない。実行するなら --apply を付ける。");
  process.exit(0);
}
if (targets.length === 0) {
  console.log("生成対象なし。");
  process.exit(0);
}

await initAgent();

let done = 0;
let failed = 0;
for (const [index, target] of targets.entries()) {
  const progress = `[${index + 1}/${targets.length}]`;
  try {
    // 生成の再試行ラダー（最大3時間）は processNagiDiary の中。ここでは包まない。
    await processNagiDiary(target.did, {
      date,
      until: target.until,
      timezone: target.timezone,
    });
    // processNagiDiary は失敗しても throw せずログして戻るので、書けたかは実データで確認する。
    if (await hasDiary(target.did, date)) {
      done += 1;
      console.log(`${progress} ${target.did}: OK`);
    } else {
      failed += 1;
      console.error(`${progress} ${target.did}: 生成されなかった（上のログを見ること）`);
    }
  } catch (error) {
    failed += 1;
    console.error(`${progress} ${target.did}: FAILED`, error);
  }
}

console.log(`done: ${done} written, ${failed} failed`);
process.exit(failed ? 1 : 0);
