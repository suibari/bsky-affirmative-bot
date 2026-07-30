import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.NAGI_BOT_DID ??= "did:plc:bot";

const { db, nagiCommunityAffirmations, nagiPosts } =
  await import("@bsky-affirmative-bot/database");
const { and } = await import("drizzle-orm");
const {
  communityAffirmationVisibility,
  decodeCommunityAffirmationCursor,
  encodeCommunityAffirmationCursor,
} = await import("../src/queries/communityAffirmations.js");

test("匿名候補のSQLは期間・CID・反応上限・CW・自分・ミュートを再検証する", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");
  const query = db
    .select({ uri: nagiPosts.uri })
    .from(nagiCommunityAffirmations)
    .innerJoin(
      nagiPosts,
      and(
        ...communityAffirmationVisibility({
          viewerDid: "did:plc:self",
          now,
          lang: "ja",
          mutes: {
            actors: ["did:plc:muted"],
            channels: ["at://did:plc:owner/com.suibari.nagi.channel/one"],
          },
        }),
      ),
    )
    .toSQL();
  const text = query.sql.replace(/\s+/g, " ");
  assert.ok(text.includes('"source_cid"'));
  assert.ok(text.includes('"reply_parent_uri" is null'));
  assert.ok(text.includes("community_reaction"));
  assert.ok(text.includes("<= 1"));
  assert.ok(text.includes("cwRestricted"));
  assert.ok(query.params.includes("did:plc:self"));
  assert.ok(query.params.includes("did:plc:muted"));
  assert.ok(
    query.params.includes("at://did:plc:owner/com.suibari.nagi.channel/one"),
  );
  assert.ok(
    !text.includes('"kossori" =') &&
      !text.includes('"channel_only" =') &&
      !text.includes('"quote_uri" is null'),
    "こっそり・CH限定・引用を除外してはいけない",
  );
});

test("カーソルは同時刻のURIを含めて往復する", () => {
  const date = new Date("2026-07-30T10:00:00.000Z");
  const uri = "at://did:plc:a/com.suibari.nagi.post/one";
  assert.deepEqual(
    decodeCommunityAffirmationCursor(
      encodeCommunityAffirmationCursor(date, uri),
    ),
    [date, uri],
  );
  assert.equal(decodeCommunityAffirmationCursor("broken"), undefined);
});
