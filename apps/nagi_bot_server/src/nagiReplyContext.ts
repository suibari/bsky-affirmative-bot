import {
  db,
  filterRelatedHistory,
  nagiActors,
  nagiPosts,
  nagiProfiles,
  nagiReactions,
} from "@bsky-affirmative-bot/database";
import {
  blobImagesToImageRefs,
  resolvePdsUrl,
} from "@bsky-affirmative-bot/bot-runtime";
import { and, desc, eq, isNull, ne } from "drizzle-orm";

type ContextLink = { uri: string; title?: string; description?: string };

export function extractContextLinks(record: any) {
  const links: ContextLink[] = [];
  const seen = new Set<string>();
  let cardLinkCount = 0;
  let facetLinkCount = 0;
  if (Array.isArray(record?.linkCards)) {
    for (const card of record.linkCards) {
      if (typeof card?.uri !== "string" || seen.has(card.uri)) continue;
      seen.add(card.uri);
      links.push({
        uri: card.uri,
        ...(typeof card.title === "string" ? { title: card.title } : {}),
        ...(typeof card.description === "string"
          ? { description: card.description }
          : {}),
      });
      cardLinkCount++;
    }
  }
  if (!Array.isArray(record?.facets))
    return { links, cardLinkCount, facetLinkCount };
  for (const facet of record.facets) {
    if (!Array.isArray(facet?.features)) continue;
    for (const feature of facet.features) {
      if (
        feature?.$type === "app.bsky.richtext.facet#link" &&
        typeof feature.uri === "string"
      ) {
        facetLinkCount++;
        if (seen.has(feature.uri)) continue;
        seen.add(feature.uri);
        links.push({ uri: feature.uri });
      }
    }
  }
  return { links, cardLinkCount, facetLinkCount };
}

const profileView = (
  did: string,
  actor?: { handle: string } | null,
  profile?: { displayName: string; description: string | null } | null,
) => ({
  did,
  handle: actor?.handle ?? did,
  displayName: profile?.displayName ?? actor?.handle ?? did,
  description: profile?.description ?? undefined,
});

export async function buildNagiReplyContext(job: any) {
  const record: any = job.recordJson;
  const botDid = process.env.NAGI_BOT_DID!;
  const text = typeof record.text === "string" ? record.text : "";

  const [author, ownRows, globalRows, reactionRows, quoteRows] =
    await Promise.all([
      Promise.all([
        db
          .select()
          .from(nagiActors)
          .where(eq(nagiActors.did, job.authorDid))
          .limit(1),
        db
          .select()
          .from(nagiProfiles)
          .where(eq(nagiProfiles.did, job.authorDid))
          .limit(1),
      ]).then(([actors, profiles]) => ({
        actor: actors[0],
        profile: profiles[0],
      })),
      db
        .select({ uri: nagiPosts.uri, text: nagiPosts.text })
        .from(nagiPosts)
        .where(
          and(
            eq(nagiPosts.did, job.authorDid),
            ne(nagiPosts.uri, job.sourceUri),
            isNull(nagiPosts.deletedAt),
          ),
        )
        .orderBy(desc(nagiPosts.indexedAt))
        .limit(100),
      db
        .select({
          uri: nagiPosts.uri,
          did: nagiPosts.did,
          text: nagiPosts.text,
        })
        .from(nagiPosts)
        .where(
          and(
            ne(nagiPosts.did, job.authorDid),
            ne(nagiPosts.did, botDid),
            isNull(nagiPosts.deletedAt),
          ),
        )
        .orderBy(desc(nagiPosts.indexedAt))
        .limit(100),
      db
        .select({ emoji: nagiReactions.emoji, text: nagiPosts.text })
        .from(nagiReactions)
        .innerJoin(nagiPosts, eq(nagiPosts.uri, nagiReactions.subjectUri))
        .where(
          and(
            eq(nagiReactions.did, job.authorDid),
            eq(nagiPosts.did, botDid),
            isNull(nagiPosts.deletedAt),
          ),
        )
        .orderBy(desc(nagiReactions.indexedAt))
        .limit(1),
      record.embed?.record?.uri
        ? db
            .select({
              post: nagiPosts,
              actor: nagiActors,
              profile: nagiProfiles,
            })
            .from(nagiPosts)
            .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
            .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiPosts.did))
            .where(
              and(
                eq(nagiPosts.uri, record.embed.record.uri),
                isNull(nagiPosts.deletedAt),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
    ]);

  const relatedPosts = text.trim()
    ? await filterRelatedHistory(
        text,
        ownRows.map((row) => row.text).filter(Boolean),
        10,
        0.6,
      )
    : [];

  let followersFriend:
    | { profile: ReturnType<typeof profileView>; post: string; uri: string }
    | undefined;
  if (text.trim()) {
    const candidates = globalRows.filter((row) => row.text.trim());
    const [friendText] = await filterRelatedHistory(
      text,
      candidates.map((row) => row.text),
      1,
      0.6,
    );
    const friendPost = candidates.find((row) => row.text === friendText);
    if (friendPost) {
      const [actors, profiles] = await Promise.all([
        db
          .select()
          .from(nagiActors)
          .where(eq(nagiActors.did, friendPost.did))
          .limit(1),
        db
          .select()
          .from(nagiProfiles)
          .where(eq(nagiProfiles.did, friendPost.did))
          .limit(1),
      ]);
      followersFriend = {
        profile: profileView(friendPost.did, actors[0], profiles[0]),
        post: friendPost.text,
        uri: friendPost.uri,
      };
    }
  }

  const authorPds =
    author.actor?.pdsUrl ??
    (await resolvePdsUrl(job.authorDid).catch(() => ""));
  const image = blobImagesToImageRefs(
    job.authorDid,
    authorPds,
    record.embed?.images,
  );
  const linkThumbnails = blobImagesToImageRefs(
    job.authorDid,
    authorPds,
    Array.isArray(record.linkCards)
      ? record.linkCards.map((card: any) => ({ image: card?.thumb }))
      : undefined,
  );
  image.push(...linkThumbnails);
  const embed: any = {};
  const quote = quoteRows[0];
  if (quote) {
    embed.profile_embed = profileView(
      quote.post.did,
      quote.actor,
      quote.profile,
    );
    embed.text_embed = quote.post.text;
    const quotePds =
      quote.actor?.pdsUrl ??
      (await resolvePdsUrl(quote.post.did).catch(() => ""));
    const quoteImages = blobImagesToImageRefs(
      quote.post.did,
      quotePds,
      quote.post.embedImages as any,
    );
    embed.image_embed = quoteImages;
    image.push(...quoteImages);
  }
  const { links, cardLinkCount, facetLinkCount } = extractContextLinks(record);
  if (links.length) {
    embed.links_embed = links;
    embed.uri_embed = links[0].uri;
    embed.title_embed = links[0].title;
    embed.description_embed = links[0].description;
  }

  return {
    follower: profileView(job.authorDid, author.actor, author.profile),
    posts: [text, ...relatedPosts],
    image: image.length ? image : undefined,
    embed: Object.keys(embed).length ? embed : undefined,
    likedByFollower: reactionRows[0]
      ? `${reactionRows[0].emoji} ${reactionRows[0].text}`
      : undefined,
    followersFriend: followersFriend ? [followersFriend] : undefined,
    isSubscriber: false,
    urlContextEnabled: links.length > 0,
    diagnostics: {
      imageCount: image.length,
      linkThumbnailCount: linkThumbnails.length,
      relatedPostCount: relatedPosts.length,
      hasQuote: Boolean(quote),
      hasLink: links.length > 0,
      cardLinkCount,
      facetLinkCount,
      linkCount: links.length,
      urlContextEnabled: links.length > 0,
      hasReaction: Boolean(reactionRows[0]),
      hasFollowersFriend: Boolean(followersFriend),
    },
  };
}
