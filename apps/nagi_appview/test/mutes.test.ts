import assert from "node:assert/strict";
import test from "node:test";
import type { MuteSet } from "../src/queries/mutes.js";
// db.ts が接続文字列を要求するので、import より先にダミーを入れておく（実際には接続しない。
// toSQL() は SQL を組み立てるだけでクエリを発行しない）。
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";

const { db, nagiPosts } = await import("@bsky-affirmative-bot/database");
const { and, sql } = await import("drizzle-orm");
const { muteVisibility, sibNotMuted } = await import("../src/queries/mutes.js");

type Rendered = { text: string; params: unknown[] };
const render = (conditions: unknown[]): Rendered => {
  const query = db
    .select({ uri: nagiPosts.uri })
    .from(nagiPosts)
    .where(and(...(conditions as any[])));
  const { sql: text, params } = query.toSQL();
  return { text: text.replace(/\s+/g, " "), params };
};

const mutes = (actors: string[], channels: string[] = []): MuteSet => ({
  actors,
  channels,
});

test("no mutes produces no extra conditions", () => {
  assert.deepEqual(
    muteVisibility(mutes([], []), { actors: true, channels: true }),
    [],
  );
  assert.equal(sibNotMuted(mutes([]), true).queryChunks.length, 0);
});

test("apply flags gate each mute kind independently", () => {
  const set = mutes(["did:plc:a"], ["at://x/com.suibari.nagi.channel/1"]);
  // プロフィールフィードは両方適用外。
  assert.deepEqual(muteVisibility(set, { actors: false, channels: false }), []);
  // CH TL は投稿者ミュートだけ効かせる（開いた CH 自体は隠さない）。
  const chTimeline = render(muteVisibility(set, { actors: true, channels: false }));
  assert.ok(!chTimeline.text.includes("channel_uri"));
  assert.ok(chTimeline.text.includes('"did" not in'));
});

test("muted actors bind as a single text[] parameter, not a row constructor", () => {
  // ここが壊れると ($1, $2)::text[] になり、ミュート2件目から実行時エラーになる。
  // 1件のときだけ偶然通ってしまうので、複数件で検証する。
  const set = mutes(["did:plc:aaa", "did:plc:bbb"]);
  const { text, params } = render(
    muteVisibility(set, { actors: true, channels: false }),
  );
  assert.ok(
    text.includes("<> all($"),
    `expected an array comparison, got: ${text}`,
  );
  assert.ok(
    !/all\(\(\$\d+, \$\d+\)/.test(text),
    `muted actors were expanded into a row constructor: ${text}`,
  );
  const arrayParams = params.filter((p) => Array.isArray(p));
  assert.equal(arrayParams.length, 1);
  assert.deepEqual(arrayParams[0], ["did:plc:aaa", "did:plc:bbb"]);
});

test("thread root author mute hides the whole conversation", () => {
  const { text } = render(
    muteVisibility(mutes(["did:plc:aaa"]), { actors: true, channels: false }),
  );
  // ルートを引く相関サブクエリがあり、解決できない返信は false 側（非表示）に倒れること。
  assert.ok(text.includes("nagi.posts as thread_root"));
  assert.ok(text.includes("thread_root.did <> all("));
  assert.ok(text.includes("), false)"));
});

test("channel mute keeps posts that belong to no channel", () => {
  const { text } = render(
    muteVisibility(mutes([], ["at://x/com.suibari.nagi.channel/1"]), {
      actors: false,
      channels: true,
    }),
  );
  // isNull を OR し忘れると CH 無し投稿が全部消えるので、その回帰を止める。
  assert.ok(text.includes('"channel_uri" is null or'));
});

test("sib filter is added only when actor mutes apply", () => {
  const set = mutes(["did:plc:aaa", "did:plc:bbb"]);
  assert.equal(sibNotMuted(set, false).queryChunks.length, 0);
  const { text, params } = render([
    sql`not exists (select 1 from nagi.posts as sib where sib.deleted_at is null${sibNotMuted(set, true)})`,
  ]);
  assert.ok(text.includes("sib.did <> all($"));
  assert.deepEqual(
    params.filter((p) => Array.isArray(p))[0],
    ["did:plc:aaa", "did:plc:bbb"],
  );
});
