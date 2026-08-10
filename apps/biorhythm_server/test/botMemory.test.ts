import assert from "node:assert/strict";
import test from "node:test";
import { buildBiorhythmBotContext } from "../src/botMemory.js";

const base = {
  mood: "全肯定たんは、課題のノートを開いています。",
  moodEn: "Bot-tan is opening her homework notebook.",
  energy: 62,
  weather: "晴れ",
};

test("履歴の末尾が現在の mood と同じなら落とす", () => {
  const context = buildBiorhythmBotContext({
    ...base,
    history: [
      { mood: "全肯定たんは、朝ごはんを食べています。", created_at: "2026-08-10T02:00:00Z" },
      { mood: base.mood, mood_en: base.moodEn, created_at: "2026-08-10T05:00:00Z" },
    ],
  });

  assert.equal(context.recentActivities?.length, 1);
  assert.equal(context.recentActivities?.[0]?.activity, "全肯定たんは、朝ごはんを食べています。");
});

test("末尾以外に同じ mood があっても落とさない", () => {
  const context = buildBiorhythmBotContext({
    ...base,
    history: [
      { mood: base.mood, created_at: "2026-08-10T02:00:00Z" },
      { mood: "全肯定たんは、モルフォと散歩しています。", created_at: "2026-08-10T04:00:00Z" },
    ],
  });

  assert.equal(context.recentActivities?.length, 2);
});

test("履歴が空なら recentActivities を積まない", () => {
  const context = buildBiorhythmBotContext({ ...base, history: [] });
  assert.equal(context.recentActivities, undefined);
});

test("mood_en が欠けていたら日本語で埋める", () => {
  const context = buildBiorhythmBotContext({
    ...base,
    history: [{ mood: "全肯定たんは、空を撮っています。", created_at: "2026-08-10T02:00:00Z" }],
  });

  assert.equal(context.recentActivities?.[0]?.activityEn, "全肯定たんは、空を撮っています。");
});

test("定期ポストは両ネットワークへ配るので surface を設定しない", () => {
  const context = buildBiorhythmBotContext({ ...base, history: [] });
  assert.equal(context.surface, undefined);
});

test("moodEn が空なら botActivityEn は日本語にフォールバックする", () => {
  const context = buildBiorhythmBotContext({ ...base, moodEn: "", history: [] });
  assert.equal(context.botActivityEn, base.mood);
});
