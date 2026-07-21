import {
  db,
  nagiActors,
  nagiEmojis,
  nagiNotifications,
  nagiProfiles,
  nagiReactions,
} from "@bsky-affirmative-bot/database";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { emojiView } from "../services/emoji.js";
import { fetchPostRows, hydratePostViews } from "./timeline.js";
import { diaryView, fetchDiaryRows } from "./diaries.js";
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
      rows.flatMap(({ notification }) =>
        // 日記はポストではないので post の引き直し対象から外す。
        notification.type === "diary"
          ? []
          : [notification.type === "reply" ? notification.reasonUri : notification.subjectUri],
      ),
    ),
  ]);
  const diaryRows = await fetchDiaryRows([
    ...new Set(
      rows.flatMap(({ notification }) =>
        notification.type === "diary" ? [notification.subjectUri] : [],
      ),
    ),
  ]);
  const diaryByUri = new Map(diaryRows.map((row) => [row.uri, diaryView(row)]));
  const posts = await hydratePostViews(postRows, did);
  const postByUri = new Map(posts.map((post) => [post.uri, post]));
  // リアクション通知の reasonUri はリアクションレコードの URI。押された絵文字は
  // そこにしか無いので引き直す。
  const reactionUris = [
    ...new Set(
      rows.flatMap(({ notification }) =>
        notification.type === "reaction" ? [notification.reasonUri] : [],
      ),
    ),
  ];
  const reactionRows = reactionUris.length
    ? await db
        .select({
          uri: nagiReactions.uri,
          emoji: nagiReactions.emoji,
          emojiItem: nagiEmojis,
        })
        .from(nagiReactions)
        .leftJoin(nagiEmojis, eq(nagiEmojis.uri, nagiReactions.emojiUri))
        .where(inArray(nagiReactions.uri, reactionUris))
    : [];
  const reactionByUri = new Map(
    reactionRows.map((r) => {
      const bluemoji = r.emojiItem ? emojiView(r.emojiItem) : null;
      return [r.uri, { emoji: r.emoji, ...(bluemoji ? { bluemoji } : {}) }];
    }),
  );
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
      post:
        n.type === "diary"
          ? undefined
          : postByUri.get(n.type === "reply" ? n.reasonUri : n.subjectUri),
      diary: n.type === "diary" ? diaryByUri.get(n.subjectUri) : undefined,
      reaction: n.type === "reaction" ? reactionByUri.get(n.reasonUri) : undefined,
    })),
    hasMore: rows.length === limit,
  };
}
export async function getUnreadCount(did: string) {
  const [row] = await db
    .select({ value: count() })
    .from(nagiNotifications)
    .where(
      and(eq(nagiNotifications.recipientDid, did), isNull(nagiNotifications.readAt)),
    );
  return { count: row?.value ?? 0 };
}
export async function updateSeen(did: string, seenAt: Date) {
  const result = await db
    .update(nagiNotifications)
    .set({ readAt: seenAt })
    // created_at はマイクロ秒精度で入るが、API 経由の seenAt は JS Date でミリ秒に
    // 切り捨てられる。同精度で比較しないと最新の1件が取りこぼされ未読のまま残るため、
    // 比較時に created_at をミリ秒へ丸める。
    .where(
      and(
        eq(nagiNotifications.recipientDid, did),
        sql`date_trunc('milliseconds', ${nagiNotifications.createdAt}) <= ${seenAt.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: nagiNotifications.id });
  return { updated: result.length };
}
