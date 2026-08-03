import assert from "node:assert/strict";
import test from "node:test";
import type { AppBskyActorDefs } from "@atproto/api";
import {
  DASHBOARD_TOP_POST_SOURCE,
  parseDailyTopPostSource,
  selectDailyTopPostCandidate,
  toDashboardTopPost,
  type DailyTopPostCandidate,
} from "../src/DailyTopPostProvider.js";

test("ダッシュボードは設定にかかわらずcombinedを使う", () => {
  assert.equal(DASHBOARD_TOP_POST_SOURCE, "combined");
});

function candidate(
  network: "bsky" | "nagi",
  score: number,
): DailyTopPostCandidate {
  return {
    network,
    uri: `at://did:example:${network}/post/${score}`,
    cid: `${network}-${score}`,
    text: `${network} post`,
    comment: `${network} comment`,
    score,
    createdAt: new Date("2026-08-03T12:00:00+09:00"),
    profile: {
      did: `did:example:${network}`,
      handle: `${network}.example.com`,
      displayName: `${network} display name`,
    } as AppBskyActorDefs.ProfileView,
  };
}

test("combinedではBlueskyとNagiを横断して最高スコアを選ぶ", () => {
  assert.equal(
    selectDailyTopPostCandidate("combined", [
      candidate("bsky", 80),
      candidate("nagi", 95),
    ])?.network,
    "nagi",
  );
  assert.equal(
    selectDailyTopPostCandidate("combined", [
      candidate("bsky", 99),
      candidate("nagi", 90),
    ])?.network,
    "bsky",
  );
});

test("明示した単一ネットワークの候補だけを選ぶ", () => {
  const candidates = [candidate("bsky", 80), candidate("nagi", 95)];
  assert.equal(selectDailyTopPostCandidate("bsky", candidates)?.network, "bsky");
  assert.equal(selectDailyTopPostCandidate("nagi", candidates)?.network, "nagi");
});

test("候補がなければnullを返す", () => {
  assert.equal(selectDailyTopPostCandidate("combined", []), null);
});

test("不正な選出元設定はcombinedへフォールバックする", () => {
  assert.equal(parseDailyTopPostSource(undefined), "combined");
  assert.equal(parseDailyTopPostSource("invalid"), "combined");
  assert.equal(parseDailyTopPostSource("nagi"), "nagi");
});

test("共通候補をダッシュボード形式へ変換する", () => {
  const nagi = candidate("nagi", 95);
  nagi.avatarCid = "avatar-cid";
  nagi.rkey = "post-rkey";
  assert.deepEqual(toDashboardTopPost(nagi), {
    uri: nagi.uri,
    comment: "nagi comment",
    network: "nagi",
    score: 95,
    text: "nagi post",
    createdAt: "2026-08-03T03:00:00.000Z",
    authorHandle: "nagi.example.com",
    authorDisplayName: "nagi display name",
    authorAvatarCid: "avatar-cid",
    authorDid: "did:example:nagi",
    rkey: "post-rkey",
  });
});
