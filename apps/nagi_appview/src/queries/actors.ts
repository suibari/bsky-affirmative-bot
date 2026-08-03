import { db, nagiActors, nagiProfiles } from "@bsky-affirmative-bot/database";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { embedQuery } from "./hybridSearch.js";
import { ApiError } from "../middleware/errors.js";

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

// これより短いクエリは意味検索をかけない（タイプアヘッドのノイズとレイテンシを避け、
// 従来の handle/displayName prefix 挙動をそのまま維持する）。
const MIN_SEMANTIC_LEN = 3;

/** getProfile の actor は AT Protocol の慣例どおり DID と handle の両方を受け付ける。 */
export async function resolveActorDid(rawActor: string): Promise<string> {
  const actor = rawActor.trim().replace(/^@/, "");
  if (actor.startsWith("did:")) return actor;
  const [row] = await db
    .select({ did: nagiActors.did })
    .from(nagiActors)
    .where(
      and(
        eq(nagiActors.status, "active"),
        eq(sql<string>`lower(${nagiActors.handle})`, actor.toLowerCase()),
      ),
    )
    .limit(1);
  if (!row) throw new ApiError(404, "not_found", "Actor not found");
  return row.did;
}

// プロフィール埋め込み(displayName+description+分析)は短文で距離が出やすいので、投稿より緩めの
// しきい値を既定にする。env で調整可能。
const ACTOR_SEM_DIST_MAX = (() => {
  const v = Number(process.env.SEARCH_ACTOR_SEM_DIST_MAX);
  return Number.isFinite(v) && v > 0 ? v : 0.8;
})();

export async function searchActors(rawQuery: string, limit: number) {
  const query = rawQuery.trim().replace(/^@/, "").trim().slice(0, 256);
  if (!query) return { actors: [] };
  const escaped = escapeLike(query);
  const contains = `%${escaped}%`;
  const prefix = `${escaped}%`;

  // 長めのクエリ（人柄・作風などの自然文）だけ意味検索を併用する。
  const embedding =
    query.length >= MIN_SEMANTIC_LEN ? await embedQuery(query) : null;
  const vec = embedding
    ? sql`${`[${embedding.join(",")}]`}::vector`
    : null;
  const semMatch = vec
    ? sql`(${nagiProfiles.embedding} is not null and (${nagiProfiles.embedding} <=> ${vec}) < ${ACTOR_SEM_DIST_MAX})`
    : sql`false`;

  const orderBy = [
    // タイプアヘッド優先: handle 前方一致 → displayName 前方一致 → それ以外。
    sql`CASE
      WHEN ${nagiActors.handle} ILIKE ${prefix} THEN 0
      WHEN ${nagiProfiles.displayName} ILIKE ${prefix} THEN 1
      ELSE 2
    END`,
    // 前方一致しない層は意味的に近い順（embedding があるときのみ）。
    ...(vec ? [sql`(${nagiProfiles.embedding} <=> ${vec}) asc nulls last`] : []),
    asc(nagiActors.handle),
  ];

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
          semMatch,
        ),
      ),
    )
    .orderBy(...orderBy)
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
