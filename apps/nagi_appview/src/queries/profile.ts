import {
  db,
  nagiActorAnalyses,
  nagiActors,
  nagiNews,
  nagiNewsApprovals,
  nagiPostScores,
  nagiPosts,
  nagiProfiles,
  nagiReactions,
} from "@bsky-affirmative-bot/database";
import type {
  ProfileDetail,
  ProfileFeedItem,
} from "@bsky-affirmative-bot/nagi-lexicon";
import {
  and,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
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
import { getApprovedNewsViews, type NewsLang } from "./positiveNews.js";
export async function getActorProfile(
  did: string,
  lang: "ja" | "en" = "ja",
): Promise<ProfileDetail> {
  const [[actor], [profile], [stats], superPositiveLevel, currentTitle, [analysis]] =
    await Promise.all([
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
      db
        .select({
          analysisJa: nagiActorAnalyses.analysisJa,
          analysisEn: nagiActorAnalyses.analysisEn,
          taglineJa: nagiActorAnalyses.taglineJa,
          taglineEn: nagiActorAnalyses.taglineEn,
          tagsJa: nagiActorAnalyses.tagsJa,
          tagsEn: nagiActorAnalyses.tagsEn,
          updatedAt: nagiActorAnalyses.updatedAt,
        })
        .from(nagiActorAnalyses)
        .where(eq(nagiActorAnalyses.did, did)),
    ]);
  if (!actor && !profile && !stats?.postCount)
    throw new ApiError(404, "not_found", "Actor not found");
  const firstPostAt = stats?.firstPostAt
    ? new Date(stats.firstPostAt).toISOString()
    : undefined;
  const comment = analysis
    ? (lang === "en" ? analysis.analysisEn : analysis.analysisJa) || undefined
    : undefined;
  // 名刺用の3項目。prompt_version が v1 のままの行では NULL なので undefined を返し、
  // クライアント側で comment からのフォールバックに落とす。
  const tagline = analysis
    ? (lang === "en" ? analysis.taglineEn : analysis.taglineJa) || undefined
    : undefined;
  const tags = analysis
    ? (lang === "en" ? analysis.tagsEn : analysis.tagsJa) || undefined
    : undefined;
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
    comment,
    tagline,
    tags,
    cardUpdatedAt: analysis?.updatedAt?.toISOString(),
  };
}
export async function getReactedFeed(opts: {
  actorDid: string;
  limit: number;
  cursor?: string;
  viewerDid?: string;
  lang: NewsLang;
}) {
  const point = decodeCursor(opts.cursor);
  const eligiblePost = exists(
    db
      .select({ value: sql`1` })
      .from(nagiPosts)
      .where(
        and(
          eq(nagiPosts.uri, nagiReactions.subjectUri),
          isNull(nagiPosts.deletedAt),
        ),
      ),
  );
  const eligibleNews = exists(
    db
      .select({ value: sql`1` })
      .from(nagiNews)
      .innerJoin(
        nagiNewsApprovals,
        and(
          eq(nagiNewsApprovals.newsUri, nagiNews.uri),
          eq(nagiNewsApprovals.newsCid, nagiNews.cid),
        ),
      )
      .where(
        and(
          eq(nagiNews.uri, nagiReactions.subjectUri),
          isNull(nagiNews.deletedAt),
          eq(nagiNewsApprovals.status, "approved"),
        ),
      ),
  );
  const ranked = db.$with("ranked_reactions").as(
    db
      .select({
        subjectUri: nagiReactions.subjectUri,
        reactionUri: nagiReactions.uri,
        reactionIndexedAt: nagiReactions.indexedAt,
        rank: sql<number>`row_number() over (
          partition by ${nagiReactions.subjectUri}
          order by ${nagiReactions.indexedAt} desc, ${nagiReactions.uri} desc
        )`.as("reaction_rank"),
      })
      .from(nagiReactions)
      .where(
        and(
          eq(nagiReactions.did, opts.actorDid),
          or(eligiblePost, eligibleNews),
        ),
      ),
  );
  const filters: any[] = [eq(ranked.rank, 1)];
  if (point)
    filters.push(
      or(
        lt(ranked.reactionIndexedAt, point[0]),
        and(
          eq(ranked.reactionIndexedAt, point[0]),
          lt(ranked.reactionUri, point[1]),
        ),
      ),
    );
  const rows = await db
    .with(ranked)
    .select({
      subjectUri: ranked.subjectUri,
      reactionUri: ranked.reactionUri,
      reactionIndexedAt: ranked.reactionIndexedAt,
    })
    .from(ranked)
    .where(and(...filters))
    .orderBy(desc(ranked.reactionIndexedAt), desc(ranked.reactionUri))
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  const subjectUris = page.map((row) => row.subjectUri);
  const postRows: PostRow[] = subjectUris.length
    ? await db
        .select(postSelection)
        .from(nagiPosts)
        .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
        .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiPosts.did))
        .leftJoin(nagiPostScores, eq(nagiPostScores.postUri, nagiPosts.uri))
        .where(
          and(inArray(nagiPosts.uri, subjectUris), isNull(nagiPosts.deletedAt)),
        )
    : [];
  const [postItems, newsByUri, botActor] = await Promise.all([
    buildFeedItems(postRows, opts.viewerDid),
    getApprovedNewsViews(subjectUris, opts.lang, opts.viewerDid),
    getBotActor(),
  ]);
  const postByUri = new Map(postItems.map((item) => [item.uri, item]));
  const items = page.flatMap<ProfileFeedItem>((row) => {
    const post = postByUri.get(row.subjectUri);
    if (post) return [post];
    const news = newsByUri.get(row.subjectUri);
    return news ? [{ kind: "news" as const, news }] : [];
  });
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
