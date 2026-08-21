import assert from "node:assert/strict";
import test from "node:test";
import type { BotMemorySearchResult } from "@bsky-affirmative-bot/database";
import {
  buildBotMemoryTopicQuery,
  retrieveBotMemoryTopics,
  selectBotMemoryTopics,
} from "../src/botMemoryTopics.js";
import { recordScheduledPostMemoryUsage } from "../src/ScheduledPostCoordinator.js";

const row = (
  id: number,
  sourceType: BotMemorySearchResult["sourceType"],
  content: string,
  occurredAt: string,
  affirmationScore = 80,
): BotMemorySearchResult => ({
  id,
  sourceType,
  sourceId: `source-${id}`,
  sourceUri: null,
  authorId: null,
  content,
  botResponse: null,
  occurredAt: new Date(occurredAt),
  affirmationScore,
  metadata: null,
  relevance: 0.03,
  semanticRank: id,
});

test("検索クエリは現在の気分・行動履歴・未読リプライをまとめる", () => {
  const query = buildBotMemoryTopicQuery({
    currentMood: "青空を撮っている",
    botContext: {
      datetime: "now",
      weather: "晴れ",
      botActivity: "青空を撮っている",
      botActivityEn: "Taking photos",
      botEnergy: 70,
      recentActivities: [{ at: "now", activity: "自転車で走った", activityEn: "Cycling" }],
    },
    unreadReplies: ["写真を見たい"],
  });
  assert.match(query, /青空/);
  assert.match(query, /自転車/);
  assert.match(query, /写真を見たい/);
});

test("横断候補は使用済みを除き、同一source 2件・全体10件に制限する", () => {
  const now = new Date("2026-08-21T12:00:00Z");
  const rows = [
    row(1, "bsky_affirmed_post", "青空の写真を撮った", "2026-08-21T11:00:00Z"),
    row(2, "nagi_affirmed_post", "青空をカメラで撮影した", "2026-08-21T10:00:00Z"),
    row(3, "youtube_live_comment", "青空の撮影が好き", "2026-08-20T10:00:00Z"),
    row(4, "bsky_affirmed_post", "カメラ散歩", "2026-08-21T09:00:00Z"),
    row(5, "bsky_affirmed_post", "三つ目のBsky候補", "2026-08-21T08:00:00Z"),
  ];
  const selected = selectBotMemoryTopics(rows, [2], now);
  assert.equal(selected.some((item) => item.id === 2), false);
  assert.equal(selected.filter((item) => item.source === "bsky_affirmed_post").length, 2);
  assert.equal(selected.some((item) => item.source === "youtube_live_comment"), true);
  assert.ok(selected.length <= 10);
});

test("24時間と7日間を分けて検索し、14日以内の使用済みを除外する", async () => {
  const now = new Date("2026-08-21T12:00:00Z");
  const calls: any[] = [];
  const recent = row(10, "bsky_received_reply", "最近の話", "2026-08-21T10:00:00Z");
  const older = row(11, "nagi_received_reply", "少し前の話", "2026-08-18T10:00:00Z");
  const result = await retrieveBotMemoryTopics({ query: "話", now }, {
    search: async (request) => {
      calls.push(request);
      return request.until ? [older] : [recent];
    },
    getUsedIds: async () => [10],
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].excludeDocumentIds, [10]);
  assert.deepEqual(result.map((item) => item.id), [11]);
});

test("usageは投稿成功時だけ記録し、成功URIを参照にする", async () => {
  const calls: unknown[][] = [];
  const record = async (...args: any[]) => { calls.push(args); };
  assert.equal(await recordScheduledPostMemoryUsage({}, [1], record), false);
  assert.equal(calls.length, 0);
  assert.equal(await recordScheduledPostMemoryUsage({
    nagi: { uri: "at://nagi/post", cid: "cid" },
  }, [1, 2], record), true);
  assert.deepEqual(calls, [[[1, 2], "scheduled_post", "at://nagi/post"]]);
});
