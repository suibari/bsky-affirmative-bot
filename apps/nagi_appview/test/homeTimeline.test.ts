import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.NAGI_BOT_DID ??= "did:plc:bot";

const { db, nagiPosts } = await import("@bsky-affirmative-bot/database");
const { and } = await import("drizzle-orm");
const { homeTimelineVisibility } = await import("../src/queries/timeline.js");

test("home visibility is root-only and binds only the requested private actor set", () => {
  const query = db
    .select({ uri: nagiPosts.uri })
    .from(nagiPosts)
    .where(
      and(
        ...homeTimelineVisibility("did:plc:self", [
          "did:plc:self",
          "did:plc:bot",
          "did:plc:member",
        ]),
      ),
    );
  const rendered = query.toSQL();
  const text = rendered.sql.replace(/\s+/g, " ");
  assert.ok(text.includes('"reply_parent_uri" is null'));
  assert.ok(text.includes('"channel_only" = $'));
  assert.ok(text.includes('"did" = $') && text.includes('"kossori" = $'));
  for (const did of ["did:plc:self", "did:plc:bot", "did:plc:member"])
    assert.ok(rendered.params.includes(did), `missing bound actor ${did}`);
});
