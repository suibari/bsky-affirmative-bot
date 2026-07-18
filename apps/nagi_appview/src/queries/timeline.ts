import {
  db,
  nagiActors,
  nagiBotReplyJobs,
  nagiPostScores,
  nagiPosts,
  nagiProfiles,
  nagiReactions,
} from "@bsky-affirmative-bot/database";
import type { FeedItem, PostView } from "@bsky-affirmative-bot/nagi-lexicon";
import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { config } from "../config.js";
export const encodeCursor = (date: Date, uri: string) =>
  Buffer.from(JSON.stringify([date.toISOString(), uri])).toString("base64url");
export const decodeCursor = (cursor?: string): [Date, string] | undefined => {
  try {
    const [d, u] = JSON.parse(Buffer.from(cursor!, "base64url").toString());
    return [new Date(d), u];
  } catch {
    return undefined;
  }
};
export const postSelection = {
  post: nagiPosts,
  actor: nagiActors,
  profile: nagiProfiles,
  score: nagiPostScores.score,
  botReplyUri: nagiPostScores.botReplyUri,
};
export type PostRow = {
  post: typeof nagiPosts.$inferSelect;
  actor: typeof nagiActors.$inferSelect | null;
  profile: typeof nagiProfiles.$inferSelect | null;
  score: number | null;
  botReplyUri: string | null;
};
export async function fetchPostRows(uris: string[]): Promise<PostRow[]> {
  if (!uris.length) return [];
  return db
    .select(postSelection)
    .from(nagiPosts)
    .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
    .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiPosts.did))
    .leftJoin(nagiPostScores, eq(nagiPostScores.postUri, nagiPosts.uri))
    .where(inArray(nagiPosts.uri, uris));
}
export async function hydratePostViews(rows: PostRow[], viewerDid?: string): Promise<PostView[]> {
  const uris = rows.map((r) => r.post.uri);
  const reactions = uris.length
    ? await db
        .select({
          subjectUri: nagiReactions.subjectUri,
          emoji: nagiReactions.emoji,
          did: nagiReactions.did,
          uri: nagiReactions.uri,
        })
        .from(nagiReactions)
        .where(inArray(nagiReactions.subjectUri, uris))
    : [];
  return rows.map(({ post, actor, profile, score }) => {
    const deleted = Boolean(post.deletedAt);
    return {
      uri: post.uri,
      cid: post.cid,
      author: {
        did: post.did,
        handle: actor?.handle ?? post.did,
        displayName: profile?.displayName ?? undefined,
        description: profile?.description ?? undefined,
        avatar: profile?.avatarCid
          ? `/api/blob/${encodeURIComponent(post.did)}/${profile.avatarCid}`
          : undefined,
      },
      text: deleted ? "" : post.text,
      facets: (post.facets as PostView["facets"]) ?? undefined,
      langs: (post.langs as string[] | null) ?? undefined,
      createdAt: post.recordCreatedAt.toISOString(),
      indexedAt: post.indexedAt.toISOString(),
      reply: post.replyParentUri
        ? { root: post.replyRootUri ?? post.replyParentUri, parent: post.replyParentUri }
        : undefined,
      images: Array.isArray(post.embedImages)
        ? (post.embedImages as PostView["images"])
        : undefined,
      reactions: Object.values(
        reactions
          .filter((r) => r.subjectUri === post.uri)
          .reduce<Record<string, PostView["reactions"][number]>>((out, r) => {
            const item = (out[r.emoji] ??= { emoji: r.emoji, count: 0 });
            item.count += 1;
            if (viewerDid && r.did === viewerDid) {
              item.reactedByMe = true;
              item.viewerReactionUri = r.uri;
            }
            return out;
          }, {}),
      ),
      isBot: post.did === config.botDid,
      isAffirmation: (score ?? -1) >= config.affirmationThreshold,
      deleted: deleted || undefined,
    };
  });
}
export async function buildFeedItems(
  rows: PostRow[],
  viewerDid?: string,
  groupBotReplies = true,
): Promise<FeedItem[]> {
  const jobs =
    groupBotReplies && rows.length
      ? await db
          .select({
            sourceUri: nagiBotReplyJobs.sourceUri,
            state: nagiBotReplyJobs.state,
            replyUri: nagiBotReplyJobs.replyUri,
          })
          .from(nagiBotReplyJobs)
          .where(
            inArray(
              nagiBotReplyJobs.sourceUri,
              rows.map((r) => r.post.uri),
            ),
          )
      : [];
  const jobByUri = new Map(jobs.map((j) => [j.sourceUri, j]));
  const replyUris = new Set<string>();
  for (const row of rows) {
    const replyUri = jobByUri.get(row.post.uri)?.replyUri ?? row.botReplyUri;
    if (groupBotReplies && replyUri) replyUris.add(replyUri);
  }
  const replyRows = await fetchPostRows([...replyUris]);
  const views = await hydratePostViews([...rows, ...replyRows], viewerDid);
  const viewByUri = new Map(views.map((v) => [v.uri, v]));
  return rows.map((row) => {
    const view = viewByUri.get(row.post.uri)! as FeedItem;
    if (!groupBotReplies) return view;
    const job = jobByUri.get(row.post.uri);
    const replyUri = job?.replyUri ?? row.botReplyUri ?? undefined;
    const reply = replyUri ? viewByUri.get(replyUri) : undefined;
    if (reply && !reply.deleted) return { ...view, botReply: reply, botReplyState: "posted" };
    // A job exists but no ingested reply yet: pending/processing (and freshly
    // posted, still in jetstream flight) all render as "pending" for the client.
    // Absence of a job row never yields "pending" so old posts don't spin forever.
    if (job?.state === "failed") return { ...view, botReplyState: "failed" };
    if (job) return { ...view, botReplyState: "pending" };
    return view;
  });
}
export async function getTimeline(opts: {
  limit: number;
  cursor?: string;
  viewerDid?: string;
  affirmation?: boolean;
  actorDid?: string;
  filter?: "posts" | "replies" | "media";
}) {
  const point = decodeCursor(opts.cursor);
  const filters: any[] = [isNull(nagiPosts.deletedAt)];
  if (point)
    filters.push(
      or(
        lt(nagiPosts.indexedAt, point[0]),
        and(eq(nagiPosts.indexedAt, point[0]), lt(nagiPosts.uri, point[1])),
      ),
    );
  if (opts.actorDid) filters.push(eq(nagiPosts.did, opts.actorDid));
  if (opts.affirmation)
    filters.push(sql`${nagiPostScores.score} >= ${config.affirmationThreshold}`);
  if (opts.filter === "posts") filters.push(isNull(nagiPosts.replyParentUri));
  if (opts.filter === "replies") filters.push(isNotNull(nagiPosts.replyParentUri));
  if (opts.filter === "media")
    filters.push(sql`jsonb_array_length(coalesce(${nagiPosts.embedImages}, '[]'::jsonb)) > 0`);
  // Bot replies are embedded into their source post, never standalone feed items.
  filters.push(or(ne(nagiPosts.did, config.botDid), isNull(nagiPosts.replyParentUri)));
  const rows = await db
    .select(postSelection)
    .from(nagiPosts)
    .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
    .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiPosts.did))
    .leftJoin(nagiPostScores, eq(nagiPostScores.postUri, nagiPosts.uri))
    .where(and(...filters))
    .orderBy(desc(nagiPosts.indexedAt), desc(nagiPosts.uri))
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  const items = await buildFeedItems(page, opts.viewerDid);
  const last = page.at(-1)?.post;
  return {
    items,
    cursor:
      rows.length > opts.limit && last ? encodeCursor(last.indexedAt, last.uri) : undefined,
    hasMore: rows.length > opts.limit,
  };
}
