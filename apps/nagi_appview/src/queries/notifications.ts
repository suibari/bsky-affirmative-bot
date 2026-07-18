import { db, nagiActors, nagiNotifications } from "@bsky-affirmative-bot/database";
import { and, desc, eq, lte } from "drizzle-orm";
export async function getNotifications(did: string, limit: number) {
  const rows = await db
    .select({ notification: nagiNotifications, actor: nagiActors })
    .from(nagiNotifications)
    .leftJoin(nagiActors, eq(nagiActors.did, nagiNotifications.actorDid))
    .where(eq(nagiNotifications.recipientDid, did))
    .orderBy(desc(nagiNotifications.createdAt))
    .limit(limit);
  return {
    items: rows.map(({ notification: n, actor }) => ({
      ...n,
      actor: { did: n.actorDid, handle: actor?.handle ?? n.actorDid },
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
