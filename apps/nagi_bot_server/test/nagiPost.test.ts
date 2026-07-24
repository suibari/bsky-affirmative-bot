import assert from "node:assert/strict";
import test from "node:test";
import { detectNagiFacets } from "../src/nagiLinkCards.js";
import { buildNagiPostRecord } from "../src/nagiPost.js";

test("detects hashtag facets as well as links", () => {
  const text = "今日もすてき #Nagi https://example.com/path";
  const { facets, urls } = detectNagiFacets(text);

  assert.deepEqual(
    facets.flatMap((facet) => facet.features),
    [
      { $type: "app.bsky.richtext.facet#tag", tag: "Nagi" },
      { $type: "app.bsky.richtext.facet#link", uri: "https://example.com/path" },
    ],
  );
  assert.deepEqual(urls, ["https://example.com/path"]);
});

test("does not save unresolved mention facets", () => {
  const { facets } = detectNagiFacets("@alice.example #hello");

  assert.deepEqual(
    facets.flatMap((facet) => facet.features),
    [{ $type: "app.bsky.richtext.facet#tag", tag: "hello" }],
  );
});

test("the common post record builder always detects tag facets", async () => {
  const record = await buildNagiPostRecord({
    text: "定期投稿です #botたん",
    label: "TEST",
    langs: ["ja"],
  });

  assert.equal(record.$type, "com.suibari.nagi.post");
  assert.deepEqual(record.langs, ["ja"]);
  assert.deepEqual(
    record.facets?.flatMap((facet) => facet.features),
    [{ $type: "app.bsky.richtext.facet#tag", tag: "botたん" }],
  );
});
