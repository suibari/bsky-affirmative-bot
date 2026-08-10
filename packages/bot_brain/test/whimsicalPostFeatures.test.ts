import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhimsicalPlanPrompt,
  NAGI_FEATURE_INTRO_EN,
  NAGI_FEATURE_INTRO_JA,
} from "../src/gemini/generateWhimsicalPost.js";

test("日本語のアプリ紹介候補にNagiならではの体験を含める", () => {
  assert.match(NAGI_FEATURE_INTRO_JA, /botたんのために作られた全肯定SNS/);
  assert.match(NAGI_FEATURE_INTRO_JA, /数字を気にせず/);
  assert.match(NAGI_FEATURE_INTRO_JA, /日記をカレンダーで振り返れる/);
  assert.match(NAGI_FEATURE_INTRO_JA, /https:\/\/nagi\.suibari\.com\//);
});

test("英語のアプリ紹介候補にもNagiならではの体験を含める", () => {
  assert.match(NAGI_FEATURE_INTRO_EN, /all-affirming social network made for bot-tan/);
  assert.match(NAGI_FEATURE_INTRO_EN, /without worrying about reaction or follower counts/);
  assert.match(NAGI_FEATURE_INTRO_EN, /daily diaries.*calendar/);
  assert.match(NAGI_FEATURE_INTRO_EN, /https:\/\/nagi\.suibari\.com\//);
});

test("企画フェーズは今日の記憶と矛盾禁止ルールを載せる", () => {
  const prompt = buildWhimsicalPlanPrompt({
    params: {
      langStr: "日本語",
      currentMood: "全肯定たんは、ソファでくつろいでいます。",
      botContext: {
        datetime: "2026年8月10日19時0分",
        weather: "晴れ",
        botActivity: "全肯定たんは、ソファでくつろいでいます。",
        botActivityEn: "Bot-tan is relaxing on the couch.",
        botEnergy: 70,
        recentActivities: [
          {
            at: "2026-08-10T02:05:00.000Z",
            activity: "全肯定たんは、朝ごはんを食べています。",
            activityEn: "Bot-tan is having breakfast.",
          },
        ],
      },
    },
    history: [],
    whatDay: ["帽子の日"],
    positiveNewsCandidates: [],
    botFunction: "占い",
  });

  assert.match(prompt, /Do not contradict the activity history/);
  assert.match(prompt, /botたんの記憶/);
  assert.match(prompt, /朝ごはん/);
});

test("botContext が無ければ記憶の節は付かない", () => {
  const prompt = buildWhimsicalPlanPrompt({
    params: { langStr: "日本語", currentMood: "くつろいでいます" },
    history: [],
    whatDay: [],
    positiveNewsCandidates: [],
    botFunction: "占い",
  });

  assert.doesNotMatch(prompt, /botたんの記憶/);
  // 矛盾禁止ルールは常に載る（記憶が無ければ参照先が無いだけで害はない）。
  assert.match(prompt, /Do not contradict the activity history/);
});
