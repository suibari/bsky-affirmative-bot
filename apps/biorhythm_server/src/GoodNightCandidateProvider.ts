import type { AppBskyActorDefs } from "@atproto/api";
import { MemoryService } from "@bsky-affirmative-bot/clients";

export type CandidateNetwork = "bsky" | "nagi";
export type GoodNightCandidateSource = CandidateNetwork | "combined";

export interface GoodNightCandidate {
  network: CandidateNetwork;
  uri: string;
  cid: string;
  text: string;
  score: number;
  profile: AppBskyActorDefs.ProfileView;
}

async function getBskyCandidates(): Promise<GoodNightCandidate[]> {
  const rows = await MemoryService.getHighestScorePosts();
  const candidates: GoodNightCandidate[] = [];

  for (const row of rows) {
    if (!row.uri || !row.post) continue;
    try {
      const params = new URLSearchParams({ uris: row.uri });
      const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { posts?: Array<{ uri: string; cid: string; author: AppBskyActorDefs.ProfileView }> };
      const post = data.posts?.[0];
      if (!post) continue;
      candidates.push({
        network: "bsky",
        uri: post.uri,
        cid: post.cid,
        text: row.post,
        score: row.score ?? 0,
        profile: post.author,
      });
    } catch (error) {
      console.warn(`[WARN][GOOD_NIGHT] Failed to resolve Bluesky candidate ${row.uri}:`, error);
    }
  }

  return candidates;
}

async function getNagiCandidates(): Promise<GoodNightCandidate[]> {
  const rows = await MemoryService.getHighestNagiScorePosts();

  return rows.map((row) => ({
    network: "nagi",
    uri: row.uri,
    cid: row.cid,
    text: row.post,
    score: row.score,
    profile: {
      did: row.did,
      handle: row.handle || row.did,
      displayName: row.displayName || row.handle || row.did,
    } as AppBskyActorDefs.ProfileView,
  }));
}

export function selectGoodNightCandidate(
  source: GoodNightCandidateSource,
  bskyCandidates: GoodNightCandidate[],
  nagiCandidates: GoodNightCandidate[],
): GoodNightCandidate | null {
  const candidates = source === "bsky"
    ? bskyCandidates
    : source === "nagi"
      ? nagiCandidates
      : [...bskyCandidates, ...nagiCandidates];

  return [...candidates].sort((a, b) => b.score - a.score)[0] ?? null;
}

function candidateSource(value: string | undefined): GoodNightCandidateSource {
  return value === "bsky" || value === "nagi" || value === "combined"
    ? value
    : "combined";
}

export async function getGoodNightCandidate(): Promise<GoodNightCandidate | null> {
  const source = candidateSource(process.env.GOOD_NIGHT_TOP_POST_SOURCE);
  const [bskyCandidates, nagiCandidates] = await Promise.all([
    source === "nagi" ? Promise.resolve([]) : getBskyCandidates(),
    source === "bsky" ? Promise.resolve([]) : getNagiCandidates(),
  ]);
  return selectGoodNightCandidate(source, bskyCandidates, nagiCandidates);
}
