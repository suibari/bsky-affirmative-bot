import {
  db,
  nagiActors,
  nagiNotifications,
  nagiProfiles,
} from "@bsky-affirmative-bot/database";
import { and, desc, eq, lte } from "drizzle-orm";
import { fetchPostRows, hydratePostViews } from "./timeline.js";
export async function getNotifications(did: string, limit: number) {
  const rows = await db
    .select({ notification: nagiNotifications, actor: nagiActors, profile: nagiProfiles })
    .from(nagiNotifications)
    .leftJoin(nagiActors, eq(nagiActors.did, nagiNotifications.actorDid))
    .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiNotifications.actorDid))
    .where(eq(nagiNotifications.recipientDid, did))
    .orderBy(desc(nagiNotifications.createdAt))
    .limit(limit);
  const postRows = await fetchPostRows([
    ...new Set(
      rows.map(({ notification }) =>
        notification.type === "reply" ? notification.reasonUri : notification.subjectUri,
      ),
    ),
  ]);
  const posts = await hydratePostViews(postRows, did);
  const postByUri = new Map(posts.map((post) => [post.uri, post]));
  return {
    items: rows.map(({ notification: n, actor, profile }) => ({
      ...n,
      actor: {
        did: n.actorDid,
        handle: actor?.handle ?? n.actorDid,
        displayName: profile?.displayName ?? undefined,
        avatar: profile?.avatarCid
          ? `/api/blob/${encodeURIComponent(n.actorDid)}/${profile.avatarCid}`
          : undefined,
      },
      post: postByUri.get(n.type === "reply" ? n.reasonUri : n.subjectUri),
    })),
    hasMore: rows.length === limit,
  };
}
export async function updateSeen(did: string, seenAt: Date) {
  const result = await db
    .update(nagiNotifications)
    .set({ readAt: seenAt })
    .where(and(eq(nagiNotifications.recipientDid, did), lte(nagiNotifications.createdAt, seenAt)))
    .returning({ id: nagiNotifications.id });
  return { updated: result.length };
}
