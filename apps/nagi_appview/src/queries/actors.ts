import { db, nagiActors, nagiProfiles } from "@bsky-affirmative-bot/database";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export async function searchActors(rawQuery: string, limit: number) {
  const query = rawQuery.trim().replace(/^@/, "").trim().slice(0, 256);
  if (!query) return { actors: [] };
  const escaped = escapeLike(query);
  const contains = `%${escaped}%`;
  const prefix = `${escaped}%`;
  const rows = await db
    .select({ actor: nagiActors, profile: nagiProfiles })
    .from(nagiProfiles)
    .innerJoin(nagiActors, eq(nagiActors.did, nagiProfiles.did))
    .where(
      and(
        eq(nagiActors.status, "active"),
        or(
          ilike(nagiActors.handle, contains),
          ilike(nagiProfiles.displayName, contains),
        ),
      ),
    )
    .orderBy(
      sql`CASE
        WHEN ${nagiActors.handle} ILIKE ${prefix} THEN 0
        WHEN ${nagiProfiles.displayName} ILIKE ${prefix} THEN 1
        ELSE 2
      END`,
      asc(nagiActors.handle),
    )
    .limit(Math.min(10, Math.max(1, limit)));
  return {
    actors: rows.map(({ actor, profile }) => ({
      did: actor.did,
      handle: actor.handle,
      displayName: profile.displayName,
      avatar: profile.avatarCid
        ? `/api/blob/${encodeURIComponent(actor.did)}/${profile.avatarCid}`
        : undefined,
    })),
  };
}
