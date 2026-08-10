import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlannedEventSection,
  isPlanFresh,
  parseDailyPlan,
  takePlannedEvent,
  type DailyPlan,
} from "../src/dailyPlan.js";

const plan = (overrides: Partial<DailyPlan> = {}): DailyPlan => ({
  botDate: "2026-08-10",
  outfit: "水色のワンピース",
  companion: "ことみちゃん",
  moodDirection: "のんびりしたい気分",
  events: [
    { status: "FreeTime", activity: "蒼穹のカノンの最新話を見る", durationMinutes: 45 },
    { status: "FreeTime", activity: "モルフォと散歩する", durationMinutes: 30 },
    { status: "Study", activity: "数学の課題をやる", durationMinutes: 60 },
  ],
  usedEventIds: [],
  ...overrides,
});

test("ステータスに合うイベントだけを返す", () => {
  const picked = takePlannedEvent(plan(), "Study");
  assert.equal(picked?.event.activity, "数学の課題をやる");
  assert.equal(picked?.index, 2);
});

test("そのステータスのイベントが無ければ undefined（Geminiフォールバックに落ちる）", () => {
  assert.equal(takePlannedEvent(plan(), "Sleep"), undefined);
  assert.equal(takePlannedEvent(undefined, "Study"), undefined);
});

test("未消化を優先して選ぶ", () => {
  const picked = takePlannedEvent(plan({ usedEventIds: [0] }), "FreeTime");
  assert.equal(picked?.index, 1);
});

test("未消化が尽きたら消化済みを再利用する", () => {
  const picked = takePlannedEvent(plan({ usedEventIds: [0, 1, 2] }), "FreeTime");
  assert.ok(picked);
  assert.ok([0, 1].includes(picked.index));
});

test("直前に選んだ予定は選ばない", () => {
  // 描写文は予定文そのままではないので、直前判定は文字列ではなくインデックスで行う。
  const picked = takePlannedEvent(
    plan({ usedEventIds: [0, 1], lastEventIndex: 0 }),
    "FreeTime",
  );
  assert.equal(picked?.index, 1);
});

test("候補が1件しか無ければ直前と同じでもそれを返す", () => {
  const picked = takePlannedEvent(
    plan({
      events: [{ status: "Study", activity: "数学の課題をやる", durationMinutes: 60 }],
      usedEventIds: [0],
      lastEventIndex: 0,
    }),
    "Study",
  );
  assert.equal(picked?.event.activity, "数学の課題をやる");
});

test("bot日が変わったプランは失効する", () => {
  assert.equal(isPlanFresh(plan(), "2026-08-10"), true);
  assert.equal(isPlanFresh(plan(), "2026-08-11"), false);
  assert.equal(isPlanFresh(plan({ events: [] }), "2026-08-10"), false);
  assert.equal(isPlanFresh(undefined, "2026-08-10"), false);
});

test("durationMinutes は 5〜90 にクランプする", () => {
  const parsed = parseDailyPlan(
    {
      outfit: "水色のワンピース",
      companion: "ひとり",
      moodDirection: "元気",
      events: [
        { status: "Study", activity: "課題", durationMinutes: 300 },
        { status: "Relax", activity: "お茶を飲む", durationMinutes: 1 },
        { status: "Sleep", activity: "夢を見る", durationMinutes: "abc" },
      ],
    },
    "2026-08-10",
  );

  assert.deepEqual(
    parsed?.events.map((event) => event.durationMinutes),
    [90, 5, 30],
  );
});

test("未知のステータスや空の activity を持つイベントは捨てる", () => {
  const parsed = parseDailyPlan(
    {
      outfit: "",
      companion: "",
      moodDirection: "",
      events: [
        { status: "Shopping", activity: "買い物", durationMinutes: 30 },
        { status: "Study", activity: "   ", durationMinutes: 30 },
        { status: "Study", activity: "課題", durationMinutes: 30 },
      ],
    },
    "2026-08-10",
  );

  assert.equal(parsed?.events.length, 1);
  assert.equal(parsed?.events[0]?.activity, "課題");
});

test("使えるイベントが1件も無ければ undefined を返す", () => {
  assert.equal(parseDailyPlan({ events: [] }, "2026-08-10"), undefined);
  assert.equal(parseDailyPlan(null, "2026-08-10"), undefined);
  assert.equal(parseDailyPlan("{}", "2026-08-10"), undefined);
});

test("Gemini フォールバックにも今日の予定を渡す", () => {
  const section = buildPlannedEventSection(plan(), {
    status: "FreeTime",
    activity: "パトレイバーの日だから、ロボットアニメについて語り合うよ",
    durationMinutes: 60,
  });

  assert.match(section, /予定: パトレイバーの日だから/);
  assert.match(section, /今日いっしょにいる人: ことみちゃん/);
  // 作品名が一般名詞に落ちるのはローカル・Gemini 双方で起きたので、両方に同じ拘束を置く。
  assert.match(section, /一般名詞に言い換えず、そのまま status_text に書くこと/);
});

test("予定表が無ければフォールバック側には何も足さない", () => {
  assert.equal(buildPlannedEventSection(undefined, undefined), "");
  assert.equal(buildPlannedEventSection(plan(), undefined), "");
});
