import {
  db,
  nagiActors,
  nagiPostScores,
  nagiPosts,
  nagiProfiles,
  nagiReactions,
} from "@bsky-affirmative-bot/database";
import type { ProfileDetail } from "@bsky-affirmative-bot/nagi-lexicon";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { config } from "../config.js";
import { ApiError } from "../middleware/errors.js";
import { getCurrentTitle, getSuperPositiveLevel } from "./badges.js";
import {
  buildFeedItems,
  decodeCursor,
  encodeCursor,
  getBotActor,
  postSelection,
  type PostRow,
} from "./timeline.js";
export async function getActorProfile(did: string): Promise<ProfileDetail> {
  const [[actor], [profile], [stats], superPositiveLevel, currentTitle] = await Promise.all([
    db.select().from(nagiActors).where(eq(nagiActors.did, did)),
    db.select().from(nagiProfiles).where(eq(nagiProfiles.did, did)),
    db
      .select({
        postCount: sql<number>`count(*)::int`,
        firstPostAt: sql<string | null>`min(${nagiPosts.recordCreatedAt})`,
      })
      .from(nagiPosts)
      .where(and(eq(nagiPosts.did, did), isNull(nagiPosts.deletedAt))),
    getSuperPositiveLevel(did),
    getCurrentTitle(did),
  ]);
  if (!actor && !profile && !stats?.postCount)
    throw new ApiError(404, "not_found", "Actor not found");
  const firstPostAt = stats?.firstPostAt ? new Date(stats.firstPostAt).toISOString() : undefined;
  return {
    did,
    handle: actor?.handle ?? did,
    displayName: profile?.displayName ?? undefined,
    description: profile?.description ?? undefined,
    avatar: profile?.avatarCid
      ? `/api/blob/${encodeURIComponent(did)}/${profile.avatarCid}`
      : undefined,
    isBot: did === config.botDid,
    superPositiveLevel,
    currentTitle,
    postCount: stats?.postCount ?? 0,
    firstPostAt,
    joinedAt: profile?.createdAt?.toISOString() ?? firstPostAt,
  };
}
export async function getReactedFeed(opts: {
  actorDid: string;
  limit: number;
  cursor?: string;
  viewerDid?: string;
}) {
  const point = decodeCursor(opts.cursor);
  const filters: any[] = [eq(nagiReactions.did, opts.actorDid), isNull(nagiPosts.deletedAt)];
  if (point)
    filters.push(
      or(
        lt(nagiReactions.indexedAt, point[0]),
        and(eq(nagiReactions.indexedAt, point[0]), lt(nagiReactions.uri, point[1])),
      ),
    );
  const rows = await db
    .select({
      ...postSelection,
      reactionUri: nagiReactions.uri,
      reactionIndexedAt: nagiReactions.indexedAt,
    })
    .from(nagiReactions)
    .innerJoin(nagiPosts, eq(nagiPosts.uri, nagiReactions.subjectUri))
    .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
    .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiPosts.did))
    .leftJoin(nagiPostScores, eq(nagiPostScores.postUri, nagiPosts.uri))
    .where(and(...filters))
    .orderBy(desc(nagiReactions.indexedAt), desc(nagiReactions.uri))
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  // One user can react to the same post with several emoji; keep the newest occurrence.
  const seen = new Set<string>();
  const deduped: PostRow[] = [];
  for (const row of page) {
    if (seen.has(row.post.uri)) continue;
    seen.add(row.post.uri);
    deduped.push(row);
  }
  const [items, botActor] = await Promise.all([
    buildFeedItems(deduped, opts.viewerDid),
    getBotActor(),
  ]);
  const last = page.at(-1);
  return {
    items,
    botActor,
    cursor:
      rows.length > opts.limit && last
        ? encodeCursor(last.reactionIndexedAt, last.reactionUri)
        : undefined,
    hasMore: rows.length > opts.limit,
  };
}
