import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.NAGI_BOT_DID ??= "did:plc:bot";

const { db, nagiPosts } = await import("@bsky-affirmative-bot/database");
const { eq, or } = await import("drizzle-orm");

test("thread query uses the resolved root instead of the requested reply", () => {
  const rootUri = "at://did:plc:root/com.suibari.nagi.post/root";
  const requestedReply = "at://did:plc:reply/com.suibari.nagi.post/reply";
  const query = db
    .select({ uri: nagiPosts.uri })
    .from(nagiPosts)
    .where(
      or(
        eq(nagiPosts.uri, rootUri),
        eq(nagiPosts.replyRootUri, rootUri),
      ),
    );
  const rendered = query.toSQL();

  assert.ok(rendered.params.includes(rootUri));
  assert.equal(rendered.params.includes(requestedReply), false);
  assert.match(rendered.sql, /"uri" = .* or .*"reply_root_uri" =/);
});
