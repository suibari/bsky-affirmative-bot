import {
  db,
  nagiActors,
  nagiPostScores,
  nagiPosts,
  nagiProfiles,
  nagiReactions,
} from "@bsky-affirmative-bot/database";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { config } from "../config.js";
const encode = (date: Date, uri: string) =>
  Buffer.from(JSON.stringify([date.toISOString(), uri])).toString("base64url");
const decode = (cursor?: string): [Date, string] | undefined => {
  try {
    const [d, u] = JSON.parse(Buffer.from(cursor!, "base64url").toString());
    return [new Date(d), u];
  } catch {
    return undefined;
  }
};
export async function getTimeline(opts: {
  limit: number;
  cursor?: string;
  viewerDid?: string;
  trend?: boolean;
  actorDid?: string;
}) {
  const point = decode(opts.cursor);
  const filters: any[] = [isNull(nagiPosts.deletedAt)];
  if (point)
    filters.push(
      or(
        lt(nagiPosts.indexedAt, point[0]),
        and(eq(nagiPosts.indexedAt, point[0]), lt(nagiPosts.uri, point[1])),
      ),
    );
  if (opts.actorDid) filters.push(eq(nagiPosts.did, opts.actorDid));
  if (opts.trend) filters.push(sql`${nagiPostScores.score} >= ${config.trendThreshold}`);
  const rows = await db
    .select({
      post: nagiPosts,
      actor: nagiActors,
      profile: nagiProfiles,
      score: nagiPostScores.score,
    })
    .from(nagiPosts)
    .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
    .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiPosts.did))
    .leftJoin(nagiPostScores, eq(nagiPostScores.postUri, nagiPosts.uri))
    .where(and(...filters))
    .orderBy(desc(nagiPosts.indexedAt), desc(nagiPosts.uri))
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  const uris = page.map((x) => x.post.uri);
  const reactions = uris.length
    ? await db
        .select({
          subjectUri: nagiReactions.subjectUri,
          emoji: nagiReactions.emoji,
          did: nagiReactions.did,
          count: sql<number>`count(*)::int`,
        })
        .from(nagiReactions)
        .where(inArray(nagiReactions.subjectUri, uris))
        .groupBy(nagiReactions.subjectUri, nagiReactions.emoji, nagiReactions.did)
    : [];
  const items = page.map(({ post, actor, profile, score }) => ({
    uri: post.uri,
    cid: post.cid,
    author: {
      did: post.did,
      handle: actor?.handle ?? post.did,
      displayName: profile?.displayName,
      description: profile?.description ?? undefined,
      avatar: profile?.avatarCid
        ? `/api/blob/${encodeURIComponent(post.did)}/${profile.avatarCid}`
        : undefined,
    },
    text: post.text,
    facets: post.facets ?? undefined,
    langs: post.langs ?? undefined,
    createdAt: post.recordCreatedAt.toISOString(),
    indexedAt: post.indexedAt.toISOString(),
    reply: post.replyParentUri
      ? { root: post.replyRootUri, parent: post.replyParentUri }
      : undefined,
    images: Array.isArray(post.embedImages) ? post.embedImages : undefined,
    reactions: Object.values(
      reactions
        .filter((r) => r.subjectUri === post.uri)
        .reduce<Record<string, any>>((out, r) => {
          const item = (out[r.emoji] ??= { emoji: r.emoji, count: 0 });
          item.count += r.count;
          if (opts.viewerDid)
            item.reactedByMe = Boolean(item.reactedByMe || r.did === opts.viewerDid);
          return out;
        }, {}),
    ),
    isBot: post.did === config.botDid,
    isTrend: (score ?? -1) >= config.trendThreshold,
  }));
  const last = page.at(-1)?.post;
  return {
    items,
    cursor: rows.length > opts.limit && last ? encode(last.indexedAt, last.uri) : undefined,
    hasMore: rows.length > opts.limit,
  };
}
