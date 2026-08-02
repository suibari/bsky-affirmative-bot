import assert from "node:assert/strict";
import test from "node:test";
import type { AppBskyActorDefs } from "@atproto/api";
import {
  selectGoodNightCandidate,
  type GoodNightCandidate,
} from "../src/GoodNightCandidateProvider.js";

function candidate(
  network: "bsky" | "nagi",
  score: number,
): GoodNightCandidate {
  return {
    network,
    uri: `at://did:example:${network}/post/${score}`,
    cid: `${network}-${score}`,
    text: `${network} post`,
    score,
    createdAt: new Date("2026-08-03T12:00:00+09:00"),
    profile: {
      did: `did:example:${network}`,
      handle: `${network}.example.com`,
    } as AppBskyActorDefs.ProfileView,
  };
}

test("combinedではBlueskyとNagiを横断して最高スコアを選ぶ", () => {
  assert.equal(
    selectGoodNightCandidate(
      "combined",
      [candidate("bsky", 80)],
      [candidate("nagi", 95)],
    )?.network,
    "nagi",
  );
  assert.equal(
    selectGoodNightCandidate(
      "combined",
      [candidate("bsky", 99)],
      [candidate("nagi", 90)],
    )?.network,
    "bsky",
  );
});

test("明示した単一ネットワークの候補だけを選ぶ", () => {
  assert.equal(
    selectGoodNightCandidate(
      "bsky",
      [candidate("bsky", 80)],
      [candidate("nagi", 95)],
    )?.network,
    "bsky",
  );
  assert.equal(
    selectGoodNightCandidate(
      "nagi",
      [candidate("bsky", 99)],
      [candidate("nagi", 90)],
    )?.network,
    "nagi",
  );
});

test("候補がなければnullを返す", () => {
  assert.equal(selectGoodNightCandidate("combined", [], []), null);
});
