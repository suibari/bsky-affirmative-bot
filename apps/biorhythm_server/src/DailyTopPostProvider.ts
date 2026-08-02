import type { AppBskyActorDefs } from "@atproto/api";
import { MemoryService } from "@bsky-affirmative-bot/clients";
import type {
  DailyTopPostCandidateRow,
  TopPost,
} from "@bsky-affirmative-bot/database";
import {
  botDayRange,
  isInBotDayRange,
  type BotDayRange,
} from "@bsky-affirmative-bot/shared-configs";

export type DailyTopPostNetwork = "bsky" | "nagi";
export type DailyTopPostSource = DailyTopPostNetwork | "combined";

export interface DailyTopPostCandidate {
  network: DailyTopPostNetwork;
  uri: string;
  cid: string;
  text: string;
  comment: string;
  score: number;
  createdAt: Date;
  profile: AppBskyActorDefs.ProfileView;
  avatarCid?: string;
  rkey?: string;
}

export function parseDailyTopPostSource(
  value: string | undefined,
): DailyTopPostSource {
  return value === "bsky" || value === "nagi" || value === "combined"
    ? value
    : "combined";
}

function configuredDailyTopPostSource(): DailyTopPostSource {
  return parseDailyTopPostSource(
    process.env.DAILY_TOP_POST_SOURCE ?? process.env.GOOD_NIGHT_TOP_POST_SOURCE,
  );
}

export function selectDailyTopPostCandidate(
  source: DailyTopPostSource,
  candidates: DailyTopPostCandidate[],
): DailyTopPostCandidate | null {
  const scoped = source === "combined"
    ? candidates
    : candidates.filter((candidate) => candidate.network === source);
  return [...scoped].sort((a, b) => b.score - a.score)[0] ?? null;
}

async function resolveBskyCandidates(
  rows: DailyTopPostCandidateRow[],
  range: BotDayRange,
): Promise<DailyTopPostCandidate[]> {
  if (rows.length === 0) return [];

  const params = new URLSearchParams();
  for (const row of rows) params.append("uris", row.uri);
  const response = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?${params}`,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to resolve Bluesky daily top candidates: HTTP ${response.status}`,
    );
  }
  const data = await response.json() as {
    posts?: Array<{
      uri: string;
      cid: string;
      author: AppBskyActorDefs.ProfileView;
      record?: { createdAt?: string };
    }>;
  };
  const postsByUri = new Map((data.posts ?? []).map((post) => [post.uri, post]));

  return rows.flatMap((row) => {
    const post = postsByUri.get(row.uri);
    if (!post) return [];
    const createdAt = new Date(post.record?.createdAt ?? "");
    if (!Number.isFinite(createdAt.getTime()) || !isInBotDayRange(createdAt, range)) {
      return [];
    }
    return [
      {
        network: "bsky" as const,
        uri: post.uri,
        cid: post.cid,
        text: row.text,
        comment: row.comment,
        score: row.score,
        createdAt,
        profile: post.author,
      },
    ];
  });
}

function resolveNagiCandidates(
  rows: DailyTopPostCandidateRow[],
  range: BotDayRange,
): DailyTopPostCandidate[] {
  return rows.flatMap((row) => {
    if (!row.cid || !isInBotDayRange(row.createdAt, range)) return [];
    return [
      {
        network: "nagi" as const,
        uri: row.uri,
        cid: row.cid,
        text: row.text,
        comment: row.comment,
        score: row.score,
        createdAt: row.createdAt,
        profile: {
          did: row.did,
          handle: row.handle || row.did,
          displayName: row.displayName || row.handle || row.did,
        } as AppBskyActorDefs.ProfileView,
        avatarCid: row.avatarCid,
        rkey: row.rkey,
      },
    ];
  });
}

export async function getDailyTopPostCandidate(
  now: Date = new Date(),
  source: DailyTopPostSource = configuredDailyTopPostSource(),
): Promise<DailyTopPostCandidate | null> {
  const range = botDayRange(now);
  const rows = await MemoryService.getDailyTopPostCandidateRows(
    range.start,
    range.end,
  );
  const bskyRows = source === "nagi"
    ? []
    : rows.filter((row) => row.network === "bsky");
  const nagiRows = source === "bsky"
    ? []
    : rows.filter((row) => row.network === "nagi");
  const [bskyCandidates, nagiCandidates] = await Promise.all([
    resolveBskyCandidates(bskyRows, range),
    Promise.resolve(resolveNagiCandidates(nagiRows, range)),
  ]);
  return selectDailyTopPostCandidate(source, [
    ...bskyCandidates,
    ...nagiCandidates,
  ]);
}

export function toDashboardTopPost(
  candidate: DailyTopPostCandidate,
): TopPost {
  return candidate.network === "bsky"
    ? {
        uri: candidate.uri,
        comment: candidate.comment,
        network: "bsky",
        score: candidate.score,
      }
    : {
        uri: candidate.uri,
        comment: candidate.comment,
        network: "nagi",
        score: candidate.score,
        text: candidate.text,
        createdAt: candidate.createdAt.toISOString(),
        authorHandle: candidate.profile.handle,
        authorDisplayName: candidate.profile.displayName,
        authorAvatarCid: candidate.avatarCid,
        authorDid: candidate.profile.did,
        rkey: candidate.rkey,
      };
}
