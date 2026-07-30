import {
  db,
  nagiCommunityAffirmations,
  nagiPosts,
} from "@bsky-affirmative-bot/database";
import type {
  CommunityAffirmationPage,
  CommunityAffirmationView,
} from "@bsky-affirmative-bot/nagi-lexicon";
import {
  and,
  asc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { getReactionViews } from "./reactions.js";
import { loadMutes, muteVisibility, type MuteSet } from "./mutes.js";

const ONE_HOUR_MS = 60 * 60 * 1_000;
const SEVEN_DAYS_MS = 7 * 24 * ONE_HOUR_MS;

export const encodeCommunityAffirmationCursor = (date: Date, uri: string) =>
  Buffer.from(JSON.stringify([date.toISOString(), uri])).toString("base64url");

export const decodeCommunityAffirmationCursor = (
  cursor?: string,
): [Date, string] | undefined => {
  if (!cursor) return undefined;
  try {
    const [date, uri] = JSON.parse(Buffer.from(cursor, "base64url").toString());
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) || typeof uri !== "string"
      ? undefined
      : [parsed, uri];
  } catch {
    return undefined;
  }
};

export function communityAffirmationVisibility(opts: {
  viewerDid: string;
  now: Date;
  lang: "ja" | "en";
  mutes: MuteSet;
}) {
  return [
    eq(nagiCommunityAffirmations.state, "posted"),
    opts.lang === "ja"
      ? isNotNull(nagiCommunityAffirmations.summaryJa)
      : isNotNull(nagiCommunityAffirmations.summaryEn),
    eq(nagiPosts.uri, nagiCommunityAffirmations.sourceUri),
    eq(nagiPosts.cid, nagiCommunityAffirmations.sourceCid),
    isNull(nagiPosts.deletedAt),
    isNull(nagiPosts.replyParentUri),
    ne(nagiPosts.did, opts.viewerDid),
    lte(nagiPosts.recordCreatedAt, new Date(opts.now.getTime() - ONE_HOUR_MS)),
    gte(
      nagiPosts.recordCreatedAt,
      new Date(opts.now.getTime() - SEVEN_DAYS_MS),
    ),
    sql`coalesce((${nagiPosts.recordJson} ->> 'cwRestricted')::boolean, false) = false`,
    sql`${nagiPosts.text} not like '%||%'`,
    sql`not exists (
      select 1
      from jsonb_array_elements(coalesce(${nagiPosts.embedImages}, '[]'::jsonb)) as image
      where coalesce((image ->> 'contentWarning')::boolean, false) = true
    )`,
    sql`(
      select count(*)
      from nagi.reactions as community_reaction
      where community_reaction.subject_uri = ${nagiPosts.uri}
    ) <= 1`,
    ...muteVisibility(opts.mutes, { actors: true, channels: true }),
  ];
}

export async function getCommunityAffirmations(opts: {
  viewerDid: string;
  lang: "ja" | "en";
  limit: number;
  cursor?: string;
}): Promise<CommunityAffirmationPage> {
  const now = new Date();
  const point = decodeCommunityAffirmationCursor(opts.cursor);
  const mutes = await loadMutes(opts.viewerDid);
  const filters = communityAffirmationVisibility({
    viewerDid: opts.viewerDid,
    now,
    lang: opts.lang,
    mutes,
  });
  if (point)
    filters.push(
      or(
        gt(nagiPosts.recordCreatedAt, point[0]),
        and(
          eq(nagiPosts.recordCreatedAt, point[0]),
          gt(nagiPosts.uri, point[1]),
        ),
      )!,
    );

  const rows = await db
    .select({
      uri: nagiPosts.uri,
      cid: nagiPosts.cid,
      authorDid: nagiPosts.did,
      indexedAt: nagiPosts.recordCreatedAt,
      summaryJa: nagiCommunityAffirmations.summaryJa,
      summaryEn: nagiCommunityAffirmations.summaryEn,
    })
    .from(nagiCommunityAffirmations)
    .innerJoin(
      nagiPosts,
      and(
        eq(nagiPosts.uri, nagiCommunityAffirmations.sourceUri),
        eq(nagiPosts.cid, nagiCommunityAffirmations.sourceCid),
      ),
    )
    .where(and(...filters))
    .orderBy(asc(nagiPosts.recordCreatedAt), asc(nagiPosts.uri))
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  const reactions = await getReactionViews(
    page.map((row) => row.uri),
    opts.viewerDid,
  );
  const items: CommunityAffirmationView[] = page.map((row) => {
    const visibleReactions = (reactions.get(row.uri) ?? []).flatMap(
      (reaction) => {
        const reactors = reaction.reactors.filter(
          (actor) => actor.did !== row.authorDid,
        );
        return reactors.length ||
          reaction.hasMoreReactors ||
          reaction.reactedByMe
          ? [{ ...reaction, reactors }]
          : [];
      },
    );
    return {
      uri: row.uri,
      cid: row.cid,
      summary:
        (opts.lang === "ja" ? row.summaryJa : row.summaryEn) ??
        row.summaryJa ??
        row.summaryEn ??
        "",
      reactions: visibleReactions,
    };
  });
  const last = page.at(-1);
  return {
    items,
    hasMore: rows.length > opts.limit,
    cursor:
      rows.length > opts.limit && last
        ? encodeCommunityAffirmationCursor(last.indexedAt, last.uri)
        : undefined,
  };
}
