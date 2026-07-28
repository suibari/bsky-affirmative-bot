import assert from "node:assert/strict";
import test from "node:test";
import { serviceLimitReason, userLimitReason } from "../src/nagiAiQuota.js";

const limits = {
  user10m: 10,
  user24h: 60,
  service10m: 300,
  service24h: 2_000,
};

test("ユーザー枠は10件目までAIを許可し11件目を定型文にする", () => {
  assert.equal(userLimitReason(9, 9, limits), undefined);
  assert.equal(userLimitReason(10, 10, limits), "user_10m");
});

test("短時間枠が戻っても直近24時間60件で定型文にする", () => {
  assert.equal(userLimitReason(0, 59, limits), undefined);
  assert.equal(userLimitReason(0, 60, limits), "user_24h");
});

test("短時間枠を日次枠より先に理由として返す", () => {
  assert.equal(userLimitReason(10, 60, limits), "user_10m");
});

test("サービス枠は300回目まで予約可能で301回目を拒否する", () => {
  assert.equal(serviceLimitReason(299, 299, limits), undefined);
  assert.equal(serviceLimitReason(300, 300, limits), "service_10m");
});

test("サービス日次枠は2000回で拒否する", () => {
  assert.equal(serviceLimitReason(0, 1_999, limits), undefined);
  assert.equal(serviceLimitReason(0, 2_000, limits), "service_24h");
});

test("DIDや返信種別に依存しない共通の件数判定である", () => {
  const topLevelCounts = { recent: 5, daily: 30 };
  const conversationCounts = { recent: 5, daily: 30 };
  assert.equal(
    userLimitReason(
      topLevelCounts.recent + conversationCounts.recent,
      topLevelCounts.daily + conversationCounts.daily,
      limits,
    ),
    "user_10m",
  );
});
