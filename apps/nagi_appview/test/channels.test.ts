import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.NAGI_BOT_DID ??= "did:plc:bot";

const { db, nagiChannels } = await import("@bsky-affirmative-bot/database");
const { and } = await import("drizzle-orm");
const {
  channelDirectoryConditions,
  channelIsTrending,
  prioritizeTrending,
} = await import("../src/queries/channels.js");

const render = (conditions: Parameters<typeof and>) => {
  const rendered = db
    .select({ uri: nagiChannels.uri })
    .from(nagiChannels)
    .where(and(...conditions))
    .toSQL();
  return {
    text: rendered.sql.replace(/\s+/g, " "),
    params: rendered.params,
  };
};

test("trend requires a recent non-owner, non-bot channel post", () => {
  const { text, params } = render([channelIsTrending]);
  assert.ok(text.includes("exists ( select 1 from nagi.posts as trend_post"));
  assert.ok(text.includes("trend_post.deleted_at is null"));
  assert.ok(text.includes('trend_post.did <> "nagi"."channels"."did"'));
  assert.ok(text.includes("trend_post.record_created_at >= now() - interval '5 days'"));
  assert.ok(params.includes("did:plc:bot"));
});

test("channel directory views separate subscriptions from ownership", () => {
  const list = render(channelDirectoryConditions("list", "did:plc:viewer"));
  assert.ok(list.text.includes('from "nagi"."channel_subscriptions"'));
  assert.ok(list.text.includes('"owner_did" = $'));
  assert.ok(list.params.includes("did:plc:viewer"));

  const mine = render(channelDirectoryConditions("mine", "did:plc:viewer"));
  assert.ok(mine.text.includes('"nagi"."channels"."did" = $'));
  assert.ok(!mine.text.includes("channel_subscriptions"));
  assert.ok(mine.params.includes("did:plc:viewer"));

  const anonymous = render(channelDirectoryConditions("list"));
  assert.ok(anonymous.text.includes("false"));
});

test("semantic results keep relevance order within each trend tier", () => {
  const rows = [
    { id: "normal-1", trending: false },
    { id: "trend-1", trending: true },
    { id: "trend-2", trending: true },
    { id: "normal-2", trending: false },
  ];
  assert.deepEqual(
    prioritizeTrending(rows).map((row) => row.id),
    ["trend-1", "trend-2", "normal-1", "normal-2"],
  );
});
