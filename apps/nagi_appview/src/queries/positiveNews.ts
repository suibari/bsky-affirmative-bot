import {
  db,
  nagiNews,
  nagiNewsApprovals,
} from "@bsky-affirmative-bot/database";
import type { NewsView, Page } from "@bsky-affirmative-bot/nagi-lexicon";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { decodeCursor, encodeCursor, getBotActor } from "./timeline.js";
import { getReactionViews } from "./reactions.js";
import { embedQuery, hybridConditions } from "./hybridSearch.js";

export type NewsLang = "ja" | "en";

// 検索は関連順のため offset ベースのページング（一覧の keyset とは別系統）。
const encodeOffset = (offset: number) =>
  Buffer.from(String(offset)).toString("base64url");
const decodeOffset = (cursor?: string): number => {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, "base64url").toString());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

function view(
  row: {
    news: typeof nagiNews.$inferSelect;
    approval: typeof nagiNewsApprovals.$inferSelect;
  },
  lang: NewsLang,
  reactions: NewsView["reactions"] = [],
): NewsView {
  const useEn =
    lang === "en" && Boolean(row.approval.titleEn && row.approval.botCommentEn);
  return {
    uri: row.news.uri,
    cid: row.news.cid,
    articleId: row.news.articleId,
    url: row.news.url,
    title: useEn ? row.approval.titleEn! : row.news.titleJa,
    sourceName: row.news.sourceName ?? undefined,
    sourceUrl: row.news.sourceUrl ?? undefined,
    publishedAt: row.news.publishedAt?.toISOString(),
    botComment: useEn ? row.approval.botCommentEn! : row.approval.botCommentJa!,
    lang: useEn ? "en" : "ja",
    createdAt: row.news.recordCreatedAt.toISOString(),
    indexedAt: row.news.indexedAt.toISOString(),
    reactions,
  };
}

export async function getPositiveNews(opts: {
  limit: number;
  cursor?: string;
  lang: NewsLang;
  viewerDid?: string;
}): Promise<Page<NewsView>> {
  const point = decodeCursor(opts.cursor);
  const filters: any[] = [
    isNull(nagiNews.deletedAt),
    eq(nagiNewsApprovals.status, "approved"),
    eq(nagiNewsApprovals.newsCid, nagiNews.cid),
    sql`${nagiNews.indexedAt} >= now() - interval '14 days'`,
  ];
  if (point)
    filters.push(
      or(
        lt(nagiNews.indexedAt, point[0]),
        and(eq(nagiNews.indexedAt, point[0]), lt(nagiNews.uri, point[1])),
      ),
    );
  const rows = await db
    .select({ news: nagiNews, approval: nagiNewsApprovals })
    .from(nagiNews)
    .innerJoin(nagiNewsApprovals, eq(nagiNewsApprovals.newsUri, nagiNews.uri))
    .where(and(...filters))
    .orderBy(desc(nagiNews.indexedAt), desc(nagiNews.uri))
    .limit(opts.limit + 1);
  const page = rows.slice(0, opts.limit);
  const last = page.at(-1)?.news;
  const [reactions, botActor] = await Promise.all([
    getReactionViews(
      page.map((row) => row.news.uri),
      opts.viewerDid,
    ),
    getBotActor(),
  ]);
  return {
    items: page.map((row) =>
      view(row, opts.lang, reactions.get(row.news.uri) ?? []),
    ),
    botActor,
    hasMore: rows.length > opts.limit,
    cursor:
      rows.length > opts.limit && last
        ? encodeCursor(last.indexedAt, last.uri)
        : undefined,
  };
}

/**
 * ニュースの自然文検索。承認済みニュースの titleJa を対象に意味検索(pgvector)+trgm 語彙一致の
 * ハイブリッド。出力形状は getPositiveNews と同じ（14日制限は設けず、承認済みなら全期間対象）。
 */
export async function searchNews(opts: {
  q: string;
  limit: number;
  cursor?: string;
  lang: NewsLang;
  viewerDid?: string;
}): Promise<Page<NewsView>> {
  const q = opts.q.trim();
  const offset = decodeOffset(opts.cursor);
  const embedding = await embedQuery(q);
  const { match, orderBy } = hybridConditions({
    embedding,
    q,
    embeddingCol: nagiNews.embedding,
    textExpr: nagiNews.titleJa,
  });
  const rows = await db
    .select({ news: nagiNews, approval: nagiNewsApprovals })
    .from(nagiNews)
    .innerJoin(nagiNewsApprovals, eq(nagiNewsApprovals.newsUri, nagiNews.uri))
    .where(
      and(
        isNull(nagiNews.deletedAt),
        eq(nagiNewsApprovals.status, "approved"),
        eq(nagiNewsApprovals.newsCid, nagiNews.cid),
        match,
      ),
    )
    .orderBy(orderBy, sql`${nagiNews.uri} desc`)
    .limit(opts.limit + 1)
    .offset(offset);
  const page = rows.slice(0, opts.limit);
  const hasMore = rows.length > opts.limit;
  const [reactions, botActor] = await Promise.all([
    getReactionViews(
      page.map((row) => row.news.uri),
      opts.viewerDid,
    ),
    getBotActor(),
  ]);
  return {
    items: page.map((row) =>
      view(row, opts.lang, reactions.get(row.news.uri) ?? []),
    ),
    botActor,
    hasMore,
    cursor: hasMore ? encodeOffset(offset + opts.limit) : undefined,
  };
}

/** プロフィール用。14日制限なしで、現在も承認済みのニュースだけを返す。 */
export async function getApprovedNewsViews(
  uris: string[],
  lang: NewsLang,
  viewerDid?: string,
): Promise<Map<string, NewsView>> {
  const uniqueUris = [...new Set(uris)];
  if (!uniqueUris.length) return new Map();
  const rows = await db
    .select({ news: nagiNews, approval: nagiNewsApprovals })
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
        inArray(nagiNews.uri, uniqueUris),
        isNull(nagiNews.deletedAt),
        eq(nagiNewsApprovals.status, "approved"),
      ),
    );
  const reactions = await getReactionViews(
    rows.map((row) => row.news.uri),
    viewerDid,
  );
  return new Map(
    rows.map((row) => [
      row.news.uri,
      view(row, lang, reactions.get(row.news.uri) ?? []),
    ]),
  );
}

/** 引用は14日を過ぎても表示する。非表示・削除・CID不一致なら掲載終了プレースホルダー。 */
export async function getNewsQuoteViews(
  refs: Array<{ uri: string; cid: string }>,
): Promise<Map<string, NewsView>> {
  if (!refs.length) return new Map();
  const uris = [...new Set(refs.map((ref) => ref.uri))];
  const rows = await db
    .select({ news: nagiNews, approval: nagiNewsApprovals })
    .from(nagiNews)
    .leftJoin(nagiNewsApprovals, eq(nagiNewsApprovals.newsUri, nagiNews.uri))
    .where(inArray(nagiNews.uri, uris));
  const out = new Map<string, NewsView>();
  for (const ref of refs) {
    const row = rows.find(
      (candidate) =>
        candidate.news.uri === ref.uri &&
        candidate.approval?.newsCid === ref.cid,
    );
    const key = `${ref.uri}|${ref.cid}`;
    if (
      !row ||
      !row.approval ||
      row.approval.status !== "approved" ||
      row.news.deletedAt
    ) {
      out.set(key, {
        uri: ref.uri,
        cid: ref.cid,
        articleId: "",
        url: "",
        title: "掲載終了",
        botComment: "",
        lang: "ja",
        createdAt: "",
        indexedAt: "",
        reactions: [],
        unavailable: true,
      });
    } else if (row.news.cid === ref.cid)
      out.set(key, view({ news: row.news, approval: row.approval }, "ja"));
    else if (
      row.approval.snapshotUrl &&
      row.approval.snapshotTitleJa &&
      row.approval.botCommentJa
    )
      out.set(key, {
        uri: ref.uri,
        cid: ref.cid,
        articleId: row.approval.snapshotArticleId ?? "",
        url: row.approval.snapshotUrl,
        title: row.approval.snapshotTitleJa,
        sourceName: row.approval.snapshotSourceName ?? undefined,
        sourceUrl: row.approval.snapshotSourceUrl ?? undefined,
        publishedAt: row.approval.snapshotPublishedAt?.toISOString(),
        botComment: row.approval.botCommentJa,
        lang: "ja",
        createdAt: row.approval.snapshotCreatedAt?.toISOString() ?? "",
        indexedAt: row.approval.reviewedAt.toISOString(),
        reactions: [],
      });
    else
      out.set(key, {
        uri: ref.uri,
        cid: ref.cid,
        articleId: "",
        url: "",
        title: "掲載終了",
        botComment: "",
        lang: "ja",
        createdAt: "",
        indexedAt: "",
        reactions: [],
        unavailable: true,
      });
  }
  return out;
}
