import {
  db,
  nagiActors,
  nagiBotReplyJobs,
  nagiChannels,
  nagiEmojis,
  nagiPostScores,
  nagiPosts,
  nagiProfiles,
  nagiReactions,
} from "@bsky-affirmative-bot/database";
import { NAGI, type FeedItem, type PostView } from "@bsky-affirmative-bot/nagi-lexicon";
import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { config } from "../config.js";
import { emojiView } from "../services/emoji.js";
import { getCurrentTitles, getSuperPositiveLevels } from "./badges.js";
import { getNewsQuoteViews } from "./positiveNews.js";
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
export async function hydratePostViews(
  rows: PostRow[],
  viewerDid?: string,
  quoteDepth = 0,
): Promise<PostView[]> {
  const uris = rows.map((r) => r.post.uri);
  const reactions = uris.length
    ? await db
        .select({
          subjectUri: nagiReactions.subjectUri,
          emoji: nagiReactions.emoji,
          emojiKey: nagiReactions.emojiKey,
          did: nagiReactions.did,
          uri: nagiReactions.uri,
          handle: nagiActors.handle,
          displayName: nagiProfiles.displayName,
          avatarCid: nagiProfiles.avatarCid,
          emojiItem: nagiEmojis,
        })
        .from(nagiReactions)
        .leftJoin(nagiActors, eq(nagiActors.did, nagiReactions.did))
        .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiReactions.did))
        .leftJoin(nagiEmojis, eq(nagiEmojis.uri, nagiReactions.emojiUri))
        .where(inArray(nagiReactions.subjectUri, uris))
        .orderBy(desc(nagiReactions.indexedAt))
    : [];
  const dids = rows.map((r) => r.post.did);
  const [levels, titles] = await Promise.all([
    getSuperPositiveLevels(dids),
    getCurrentTitles(dids),
  ]);
  // バッジ表示用にチャンネル名を引く（uri→name）。所属 CH のある投稿だけ。
  const channelUris = [
    ...new Set(rows.flatMap((r) => (r.post.channelUri ? [r.post.channelUri] : []))),
  ];
  const channelNames = channelUris.length
    ? new Map(
        (
          await db
            .select({ uri: nagiChannels.uri, name: nagiChannels.name })
            .from(nagiChannels)
            .where(inArray(nagiChannels.uri, channelUris))
        ).map((c) => [c.uri, c.name]),
      )
    : new Map<string, string>();
  const views = rows.map(({ post, actor, profile, score }) => {
    const deleted = Boolean(post.deletedAt);
    const images =
      !deleted && Array.isArray(post.embedImages)
        ? post.embedImages.flatMap((item: any) => {
            const cid = item?.image?.ref?.$link;
            if (typeof cid !== "string" || typeof item?.alt !== "string")
              return [];
            return [
              {
                url: `/api/blob/${encodeURIComponent(post.did)}/${encodeURIComponent(cid)}`,
                alt: item.alt,
                ...(item.aspectRatio ? { aspectRatio: item.aspectRatio } : {}),
              },
            ];
          })
        : undefined;
    const linkCards = !deleted && Array.isArray((post.recordJson as any)?.linkCards)
      ? (post.recordJson as any).linkCards.flatMap((card: any) => {
          if (typeof card?.uri !== "string" || typeof card?.title !== "string") return [];
          const cid = card.thumb?.ref?.$link;
          return [{
            uri: card.uri,
            title: card.title,
            ...(typeof card.description === "string" ? { description: card.description } : {}),
            ...(typeof cid === "string" ? { thumb: `/api/blob/${encodeURIComponent(post.did)}/${encodeURIComponent(cid)}` } : {}),
          }];
        })
      : undefined;
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
        isBot: post.did === config.botDid,
        superPositiveLevel: levels.get(post.did),
        currentTitle: titles.get(post.did),
      },
      text: deleted ? "" : post.text,
      facets: (post.facets as PostView["facets"]) ?? undefined,
      langs: (post.langs as string[] | null) ?? undefined,
      createdAt: post.recordCreatedAt.toISOString(),
      indexedAt: post.indexedAt.toISOString(),
      reply: post.replyParentUri
        ? { root: post.replyRootUri ?? post.replyParentUri, parent: post.replyParentUri }
        : undefined,
      images: images?.length ? images : undefined,
      linkCards: linkCards?.length ? linkCards : undefined,
      reactions: Object.values(
        reactions
          .filter((r) => r.subjectUri === post.uri)
          .reduce<Record<string, PostView["reactions"][number]>>((out, r) => {
            const bluemoji = r.emojiItem ? emojiView(r.emojiItem) : null;
            const item = (out[r.emojiKey] ??= {
              emoji: r.emoji,
              ...(bluemoji ? { bluemoji } : {}),
              reactors: [],
            });
            if (item.reactors.length < 5) {
              item.reactors.push({
                did: r.did,
                handle: r.handle ?? r.did,
                displayName: r.displayName ?? undefined,
                avatar: r.avatarCid
                  ? `/api/blob/${encodeURIComponent(r.did)}/${r.avatarCid}`
                  : undefined,
              });
            } else {
              item.hasMoreReactors = true;
            }
            if (viewerDid && r.did === viewerDid) {
              item.reactedByMe = true;
              item.viewerReactionUri = r.uri;
            }
            return out;
          }, {}),
      ),
      isBot: post.did === config.botDid,
      isAffirmation: (score ?? -1) >= config.affirmationThreshold,
      kossori: post.kossori || undefined,
      channel: post.channelUri
        ? {
            uri: post.channelUri,
            cid: (post.recordJson as any)?.channel?.cid ?? "",
            ...(channelNames.has(post.channelUri)
              ? { name: channelNames.get(post.channelUri) }
              : {}),
          }
        : undefined,
      channelOnly: post.channelOnly || undefined,
      deleted: deleted || undefined,
    };
  });
  if (quoteDepth >= 3) return views;
  const quoteUris = [
    ...new Set(
      rows.flatMap(({ post }) =>
        !post.deletedAt && post.quoteUri?.split("/")[3] === NAGI.post ? [post.quoteUri] : [],
      ),
    ),
  ];
  const newsRefs = rows.flatMap(({ post }) =>
    post.quoteUri?.split("/")[3] === NAGI.news && post.quoteCid
      ? [{ uri: post.quoteUri, cid: post.quoteCid }]
      : [],
  );
  const newsViews = await getNewsQuoteViews(newsRefs);
  if (!quoteUris.length && !newsRefs.length) return views;
  const quoteViews = quoteUris.length ? await hydratePostViews(await fetchPostRows(quoteUris), viewerDid, quoteDepth + 1) : [];
  const quoteByUri = new Map(quoteViews.map((view) => [view.uri, view]));
  return views.map((view, index) => {
    const quoteUri = rows[index].post.quoteUri;
    const quote = quoteUri ? quoteByUri.get(quoteUri) : undefined;
    const post = rows[index].post;
    const quotedNews = post.quoteUri && post.quoteCid
      ? newsViews.get(`${post.quoteUri}|${post.quoteCid}`)
      : undefined;
    return {
      ...view,
      ...(quote ? { quote: { kind: "post" as const, post: quote } } : {}),
      ...(quotedNews ? { quote: { kind: "news" as const, news: quotedNews } } : {}),
    };
  });
}
export async function buildFeedItems(
  rows: PostRow[],
  viewerDid?: string,
  groupBotReplies = true,
  includeReplyParents = false,
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
  const parentUris = new Set<string>();
  for (const row of rows) {
    const replyUri = jobByUri.get(row.post.uri)?.replyUri ?? row.botReplyUri;
    if (groupBotReplies && replyUri) replyUris.add(replyUri);
    if (includeReplyParents && row.post.replyParentUri) parentUris.add(row.post.replyParentUri);
  }
  const relatedRows = await fetchPostRows([...new Set([...replyUris, ...parentUris])]);
  const views = await hydratePostViews([...rows, ...relatedRows], viewerDid);
  const viewByUri = new Map(views.map((v) => [v.uri, v]));
  return rows.map((row) => {
    let view = viewByUri.get(row.post.uri)! as FeedItem;
    const replyParent = row.post.replyParentUri
      ? viewByUri.get(row.post.replyParentUri)
      : undefined;
    if (replyParent) view = { ...view, replyParent };
    if (!groupBotReplies) return view;
    const job = jobByUri.get(row.post.uri);
    const replyUri = job?.replyUri ?? row.botReplyUri ?? undefined;
    const reply = replyUri ? viewByUri.get(replyUri) : undefined;
    if (reply && !reply.deleted) return { ...view, botReply: reply, botReplyState: "posted" };
    // A freshly posted reply can still be in Jetstream flight, so it remains
    // pending until the reply record is available to hydrate.
    // Absence of a job row never yields "pending" so old posts don't spin forever.
    if (job?.state === "failed") return { ...view, botReplyState: "failed" };
    if (job)
      return {
        ...view,
        botReplyState: job.state === "processing" ? "processing" : "pending",
      };
    return view;
  });
}
export async function getTimeline(opts: {
  limit: number;
  cursor?: string;
  viewerDid?: string;
  affirmation?: boolean;
  actorDid?: string;
  /** CH タイムライン: この URI の channel を持つ投稿だけを、kossori/channelOnly に関係なく出す。 */
  channelUri?: string;
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
  if (opts.channelUri) filters.push(eq(nagiPosts.channelUri, opts.channelUri));
  if (opts.affirmation)
    filters.push(sql`${nagiPostScores.score} >= ${config.affirmationThreshold}`);
  if (opts.filter === "posts") filters.push(isNull(nagiPosts.replyParentUri));
  if (opts.filter === "replies") filters.push(isNotNull(nagiPosts.replyParentUri));
  if (opts.filter === "media")
    filters.push(sql`jsonb_array_length(coalesce(${nagiPosts.embedImages}, '[]'::jsonb)) > 0`);
  // Keep Bot replies grouped with their source post on shared timelines. An
  // explicit actor feed still needs them so the Bot profile's replies tab works.
  // CH TL も共有TL扱いで grouping する（botたんの返信は元投稿にまとめる）。
  if (!opts.actorDid)
    filters.push(or(ne(nagiPosts.did, config.botDid), isNull(nagiPosts.replyParentUri)));
  // こっそり／CH限定ポストは共有TL（グローバル/全肯定）から除外。プロフィール（actorDid）や
  // CH TL（channelUri）・スレッド・引用では見えるので、ここでだけ落とす。
  if (!opts.actorDid && !opts.channelUri) {
    filters.push(eq(nagiPosts.kossori, false));
    filters.push(eq(nagiPosts.channelOnly, false));
  }
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
  const [items, botActor] = await Promise.all([
    buildFeedItems(
      page,
      opts.viewerDid,
      true,
      opts.filter === "replies" || Boolean(opts.channelUri),
    ),
    getBotActor(),
  ]);
  const last = page.at(-1)?.post;
  return {
    items,
    botActor,
    cursor:
      rows.length > opts.limit && last ? encodeCursor(last.indexedAt, last.uri) : undefined,
    hasMore: rows.length > opts.limit,
  };
}

export async function getBotActor(): Promise<FeedItem["author"]> {
  const [actor, profile] = await Promise.all([
    db.select().from(nagiActors).where(eq(nagiActors.did, config.botDid)).limit(1),
    db.select().from(nagiProfiles).where(eq(nagiProfiles.did, config.botDid)).limit(1),
  ]);
  return {
    did: config.botDid,
    handle: actor[0]?.handle ?? config.botDid,
    displayName: profile[0]?.displayName ?? "Botたん",
    avatar: profile[0]?.avatarCid
      ? `/api/blob/${encodeURIComponent(config.botDid)}/${profile[0].avatarCid}`
      : undefined,
    isBot: true,
  };
}
