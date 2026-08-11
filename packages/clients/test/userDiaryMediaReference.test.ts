import assert from "node:assert/strict";
import test from "node:test";
import {
  USER_DIARY_MEDIA_REFERENCE_CATALOG,
  selectUserDiaryMediaReference,
} from "../src/userDiaryMediaReference.js";

const seasonalState = {
  season: "2026-summer",
  fetchedAt: "2026-08-01T00:00:00.000Z",
  works: [
    {
      kind: "anime",
      title: "今期テストアニメ",
      titleEn: "Current Test Anime",
      hookJa: "主人公が壊れた羅針盤を頼りに空中都市を進む。",
      hookEn: "The hero crosses a sky city using a broken compass.",
    },
  ],
};

function dateAfter(start: string, offset: number): string {
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

test("catalog has 72 unique, complete, broadly distributed references", () => {
  const catalog = USER_DIARY_MEDIA_REFERENCE_CATALOG;
  assert.equal(catalog.length, 72);
  assert.equal(catalog.filter((item) => item.kind === "anime").length, 54);
  assert.equal(catalog.filter((item) => item.kind === "movie").length, 18);
  assert.equal(new Set(catalog.map((item) => item.id)).size, 72);
  assert.ok(new Set(catalog.map((item) => item.era)).size >= 7);
  assert.ok(new Set(catalog.flatMap((item) => item.genres)).size >= 10);
  for (const item of catalog) {
    assert.ok(item.titleJa && item.titleEn && item.hookJa && item.hookEn);
    assert.ok(item.requiredTermsJa.length && item.requiredTermsEn.length);
  }
});

test("selection uses four fixed references and one seasonal reference per five days", async () => {
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      selectUserDiaryMediaReference("did:plc:ratio", dateAfter("2026-01-01", index), {
        loadSeasonalState: async () => seasonalState,
      }),
    ),
  );
  assert.equal(results.filter((item) => item.source === "catalog").length, 40);
  assert.equal(results.filter((item) => item.source === "seasonal").length, 10);
});

test("fixed references do not repeat during a 90-day cycle", async () => {
  const results = await Promise.all(
    Array.from({ length: 90 }, (_, index) =>
      selectUserDiaryMediaReference("did:plc:cycle", dateAfter("2026-01-01", index), {
        loadSeasonalState: async () => seasonalState,
      }),
    ),
  );
  const fixed = results.filter((item) => item.source === "catalog");
  assert.equal(fixed.length, 72);
  assert.equal(new Set(fixed.map((item) => item.id)).size, 72);
});

test("different DIDs receive different deterministic schedules", async () => {
  const loadSeasonalState = async () => seasonalState;
  const first = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      selectUserDiaryMediaReference("did:plc:first", dateAfter("2026-03-01", index), { loadSeasonalState }),
    ),
  );
  const repeated = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      selectUserDiaryMediaReference("did:plc:first", dateAfter("2026-03-01", index), { loadSeasonalState }),
    ),
  );
  const second = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      selectUserDiaryMediaReference("did:plc:second", dateAfter("2026-03-01", index), { loadSeasonalState }),
    ),
  );
  assert.deepEqual(first.map((item) => item.id), repeated.map((item) => item.id));
  assert.notDeepEqual(first.map((item) => item.id), second.map((item) => item.id));
});

test("missing, legacy, and failed seasonal caches fall back to a fixed reference", async () => {
  const did = "did:plc:fallback";
  let seasonalDate = "";
  for (let index = 0; index < 10; index += 1) {
    const date = dateAfter("2026-04-01", index);
    const result = await selectUserDiaryMediaReference(did, date, {
      loadSeasonalState: async () => seasonalState,
    });
    if (result.source === "seasonal") {
      seasonalDate = date;
      break;
    }
  }
  assert.ok(seasonalDate);

  const missing = await selectUserDiaryMediaReference(did, seasonalDate, {
    loadSeasonalState: async () => undefined,
  });
  const legacy = await selectUserDiaryMediaReference(did, seasonalDate, {
    loadSeasonalState: async () => ({
      ...seasonalState,
      works: [{ kind: "anime", title: "フックのない旧キャッシュ" }],
    }),
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  const failed = await selectUserDiaryMediaReference(did, seasonalDate, {
    loadSeasonalState: async () => { throw new Error("database unavailable"); },
  }).finally(() => { console.warn = originalWarn; });

  assert.equal(missing.source, "catalog");
  assert.equal(legacy.source, "catalog");
  assert.equal(failed.source, "catalog");
});
