import assert from "node:assert/strict";
import test from "node:test";
import { buildTimelineSegments } from "../src/publicApi.js";

const row = (iso: string, status: string, energy = 50) => ({
  status,
  mood: `${status} のきもち`,
  mood_en: `feeling ${status}`,
  energy,
  created_at: new Date(iso),
});

const DAY_START = new Date("2026-08-02T00:00:00+09:00");
const DAY_END = new Date("2026-08-03T00:00:00+09:00");

test("各行はつぎの行までの区間になり、隙間なく並ぶ", () => {
  const segments = buildTimelineSegments(
    [
      row("2026-08-02T00:30:00+09:00", "Sleep"),
      row("2026-08-02T06:10:00+09:00", "WakeUp"),
      row("2026-08-02T08:00:00+09:00", "Study"),
    ],
    DAY_START,
    DAY_END,
    new Date("2026-08-02T12:00:00+09:00"),
  );

  assert.equal(segments.length, 3);
  assert.deepEqual(
    segments.map((s) => s.status),
    ["Sleep", "WakeUp", "Study"],
  );
  // 隣り合う区間の end と start が一致する（＝帯に穴が空かない）。
  assert.equal(segments[0]!.end, segments[1]!.start);
  assert.equal(segments[1]!.end, segments[2]!.start);
  // 最後の区間は「いま」で止まる。未来は描かない。
  assert.equal(segments[2]!.end, new Date("2026-08-02T12:00:00+09:00").toISOString());
});

test("前日から継続していた行は、その日の0時から始まる区間に切り詰められる", () => {
  const segments = buildTimelineSegments(
    [
      // 前日 22:40 に始まった Sleep。先読みして渡される1件。
      row("2026-08-01T22:40:00+09:00", "Sleep"),
      row("2026-08-02T06:10:00+09:00", "WakeUp"),
    ],
    DAY_START,
    DAY_END,
    new Date("2026-08-02T12:00:00+09:00"),
  );

  assert.equal(segments.length, 2);
  // 左端が欠けず、かつ前日にはみ出さない。
  assert.equal(segments[0]!.start, DAY_START.toISOString());
  assert.equal(segments[0]!.status, "Sleep");
});

test("過去の日は24時で終わり、現在時刻に引きずられない", () => {
  const segments = buildTimelineSegments(
    [row("2026-08-02T21:00:00+09:00", "Relax")],
    DAY_START,
    DAY_END,
    new Date("2026-08-05T09:00:00+09:00"),
  );

  assert.equal(segments.length, 1);
  assert.equal(segments[0]!.end, DAY_END.toISOString());
});

test("ログが1件もなければ区間も空", () => {
  assert.deepEqual(buildTimelineSegments([], DAY_START, DAY_END, new Date()), []);
});

test("その日がまだ始まっていなければ区間は作らない", () => {
  const segments = buildTimelineSegments(
    [row("2026-08-01T22:40:00+09:00", "Sleep")],
    DAY_START,
    DAY_END,
    // 「いま」が当日0時より前。幅ゼロの区間を作ってしまわないこと。
    new Date("2026-08-01T23:00:00+09:00"),
  );

  assert.deepEqual(segments, []);
});

test("mood_en が NULL でも空文字にフォールバックする", () => {
  const segments = buildTimelineSegments(
    [{ ...row("2026-08-02T09:00:00+09:00", "Study"), mood_en: null }],
    DAY_START,
    DAY_END,
    new Date("2026-08-02T10:00:00+09:00"),
  );

  assert.equal(segments[0]!.moodEn, "");
  assert.equal(segments[0]!.mood, "Study のきもち");
});
