import assert from "node:assert/strict";
import test from "node:test";
import {
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
