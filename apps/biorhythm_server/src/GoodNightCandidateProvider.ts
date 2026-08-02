import type { AppBskyActorDefs } from "@atproto/api";
import { MemoryService } from "@bsky-affirmative-bot/clients";
import {
  goodNightDayRange,
  isInGoodNightDayRange,
  type GoodNightDayRange,
} from "@bsky-affirmative-bot/shared-configs";

export type CandidateNetwork = "bsky" | "nagi";
export type GoodNightCandidateSource = CandidateNetwork | "combined";

export interface GoodNightCandidate {
  network: CandidateNetwork;
  uri: string;
  cid: string;
  text: string;
  score: number;
  createdAt: Date;
  profile: AppBskyActorDefs.ProfileView;
}

async function getBskyCandidates(
  range: GoodNightDayRange,
): Promise<GoodNightCandidate[]> {
  const rows = await MemoryService.getHighestScorePosts(range.start, range.end);
  const candidates: GoodNightCandidate[] = [];

  for (const row of rows) {
    if (!row.uri || !row.post) continue;
    try {
      const params = new URLSearchParams({ uris: row.uri });
      const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as {
        posts?: Array<{
          uri: string;
          cid: string;
          author: AppBskyActorDefs.ProfileView;
          record?: { createdAt?: string };
        }>;
      };
      const post = data.posts?.[0];
      if (!post) continue;
      const createdAt = new Date(post.record?.createdAt ?? "");
      if (!Number.isFinite(createdAt.getTime()) || !isInGoodNightDayRange(createdAt, range)) {
        continue;
      }
      candidates.push({
        network: "bsky",
        uri: post.uri,
        cid: post.cid,
        text: row.post,
        score: row.score ?? 0,
        createdAt,
        profile: post.author,
      });
    } catch (error) {
      console.warn(`[WARN][GOOD_NIGHT] Failed to resolve Bluesky candidate ${row.uri}:`, error);
    }
  }

  return candidates;
}

async function getNagiCandidates(range: GoodNightDayRange): Promise<GoodNightCandidate[]> {
  const rows = await MemoryService.getHighestNagiScorePosts(range.start, range.end);

  return rows.flatMap((row) => {
    const createdAt = new Date(row.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || !isInGoodNightDayRange(createdAt, range)) {
      return [];
    }
    return [
      {
        network: "nagi" as const,
        uri: row.uri,
        cid: row.cid,
        text: row.post,
        score: row.score,
        createdAt,
        profile: {
          did: row.did,
          handle: row.handle || row.did,
          displayName: row.displayName || row.handle || row.did,
        } as AppBskyActorDefs.ProfileView,
      },
    ];
  });
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

export async function getGoodNightCandidate(
  now: Date = new Date(),
): Promise<GoodNightCandidate | null> {
  const source = candidateSource(process.env.GOOD_NIGHT_TOP_POST_SOURCE);
  const range = goodNightDayRange(now);
  const [bskyCandidates, nagiCandidates] = await Promise.all([
    source === "nagi" ? Promise.resolve([]) : getBskyCandidates(range),
    source === "bsky" ? Promise.resolve([]) : getNagiCandidates(range),
  ]);
  return selectGoodNightCandidate(source, bskyCandidates, nagiCandidates);
}
