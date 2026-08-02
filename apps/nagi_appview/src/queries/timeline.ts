import {
  db,
  nagiActors,
  nagiBotReplyJobs,
  nagiChannels,
  nagiPostScores,
  nagiPosts,
  nagiProfiles,
} from "@bsky-affirmative-bot/database";
import {
  NAGI,
  type ConversationView,
  type FeedItem,
  type PostView,
} from "@bsky-affirmative-bot/nagi-lexicon";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { config } from "../config.js";
import { getCurrentTitles, getSuperPositiveLevels } from "./badges.js";
import {
  EMPTY_MUTES,
  loadMutes,
  muteVisibility,
  sibNotMuted,
  type MuteSet,
} from "./mutes.js";
import { getNewsQuoteViews } from "./positiveNews.js";
import { getReactionViews } from "./reactions.js";
import { parseContentWarning } from "../util/contentWarning.js";
import { loadPrivateListMemberDids } from "./privateList.js";
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
/** ホーム候補の可視性条件。本人の kossori だけを許し、返信と CH 限定は全員分除外する。 */
export function homeTimelineVisibility(
  homeDid: string,
  actorDids: string[],
): SQL[] {
  return [
    isNull(nagiPosts.replyParentUri),
    inArray(nagiPosts.did, actorDids),
    eq(nagiPosts.channelOnly, false),
    or(eq(nagiPosts.did, homeDid), eq(nagiPosts.kossori, false))!,
  ];
}
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
/**
 * ミュート著者の投稿を落とす。mutes は呼び出し側が明示的に渡したときだけ効く（既定は空）＝
 * スレッド詳細・プロフィールはミュート非適用という仕様どおり、渡さなければ素通しになる。
 */
const dropMutedRows = (rows: PostRow[], mutes: MuteSet) =>
  mutes.actors.length
    ? rows.filter((r) => !mutes.actors.includes(r.post.did))
    : rows;
export async function hydratePostViews(
  rows: PostRow[],
  viewerDid?: string,
  quoteDepth = 0,
  mutes: MuteSet = EMPTY_MUTES,
): Promise<PostView[]> {
  const uris = rows.map((r) => r.post.uri);
  const reactions = await getReactionViews(uris, viewerDid);
  const dids = rows.map((r) => r.post.did);
  const [levels, titles] = await Promise.all([
    getSuperPositiveLevels(dids),
    getCurrentTitles(dids),
  ]);
  const rootUris = [
    ...new Set(
      rows.flatMap(({ post }) =>
        post.replyRootUri ? [post.replyRootUri] : [],
      ),
    ),
  ];
  const threadRoots = rootUris.length
    ? new Map(
        (
          await db
            .select({
              uri: nagiPosts.uri,
              cid: nagiPosts.cid,
              kossori: nagiPosts.kossori,
              channelOnly: nagiPosts.channelOnly,
            })
            .from(nagiPosts)
            .where(
              and(
                inArray(nagiPosts.uri, rootUris),
                isNull(nagiPosts.deletedAt),
              ),
            )
        ).map((root) => [root.uri, root]),
      )
    : new Map<
        string,
        { uri: string; cid: string; kossori: boolean; channelOnly: boolean }
      >();
  // バッジ表示用にチャンネル名を引く（uri→name）。所属 CH のある投稿だけ。
  const channelUris = [
    ...new Set(
      rows.flatMap((r) => (r.post.channelUri ? [r.post.channelUri] : [])),
    ),
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
    const recordReply = (post.recordJson as any)?.reply;
    const record = post.recordJson as any;
    const contentWarning = !deleted
      ? parseContentWarning(post.text)
      : { status: "none" as const };
    const threadRoot = post.replyRootUri
      ? threadRoots.get(post.replyRootUri)
      : undefined;
    // こっそりは返信レコードの値ではなくルートが所有する。旧 channelOnly も、
    // 過去のチャンネル限定スレッドを再公開しないため同じ非共有設定として扱う。
    // 参照先を解決できない返信は、意図しない共有TL露出を避けるため非共有側に倒す。
    const threadKossori = post.replyRootUri
      ? threadRoot
        ? threadRoot.kossori || threadRoot.channelOnly
        : true
      : post.kossori || post.channelOnly;
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
                ...(item.contentWarning === true
                  ? { contentWarning: true }
                  : {}),
                ...(item.aspectRatio ? { aspectRatio: item.aspectRatio } : {}),
              },
            ];
          })
        : undefined;
    const linkCards =
      !deleted && Array.isArray((post.recordJson as any)?.linkCards)
        ? (post.recordJson as any).linkCards.flatMap((card: any) => {
            if (
              typeof card?.uri !== "string" ||
              typeof card?.title !== "string"
            )
              return [];
            const cid = card.thumb?.ref?.$link;
            return [
              {
                uri: card.uri,
                title: card.title,
                ...(typeof card.description === "string"
                  ? { description: card.description }
                  : {}),
                ...(typeof cid === "string"
                  ? {
                      thumb: `/api/blob/${encodeURIComponent(post.did)}/${encodeURIComponent(cid)}`,
                    }
                  : {}),
              },
            ];
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
      ...(contentWarning.status === "valid"
        ? { contentWarning: contentWarning.range }
        : {}),
      langs: (post.langs as string[] | null) ?? undefined,
      createdAt: post.recordCreatedAt.toISOString(),
      indexedAt: post.indexedAt.toISOString(),
      edited: post.edited || undefined,
      reply: post.replyParentUri
        ? {
            root: {
              uri: post.replyRootUri ?? post.replyParentUri,
              cid:
                recordReply?.root?.cid ??
                threadRoot?.cid ??
                recordReply?.parent?.cid ??
                "",
            },
            parent: {
              uri: post.replyParentUri,
              cid: recordReply?.parent?.cid ?? "",
            },
          }
        : undefined,
      images: images?.length ? images : undefined,
      linkCards: linkCards?.length ? linkCards : undefined,
      reactions: reactions.get(post.uri) ?? [],
      isBot: post.did === config.botDid,
      isAffirmation: (score ?? -1) >= config.affirmationThreshold,
      ...(record?.cwRestricted === true ? { cwRestricted: true } : {}),
      kossori: post.kossori || undefined,
      threadKossori: threadKossori || undefined,
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
        !post.deletedAt && post.quoteUri?.split("/")[3] === NAGI.post
          ? [post.quoteUri]
          : [],
      ),
    ),
  ];
  const newsRefs = rows.flatMap(({ post }) =>
    post.quoteUri?.split("/")[3] === NAGI.news && post.quoteCid
      ? [{ uri: post.quoteUri, cid: post.quoteCid }]
      : [],
  );
  const newsViews = await getNewsQuoteViews(newsRefs, mutes.actors);
  if (!quoteUris.length && !newsRefs.length) return views;
  // 引用元がミュート著者なら引用カードだけを落とす（引用している投稿自体は残す）。
  const quoteRows = quoteUris.length
    ? dropMutedRows(await fetchPostRows(quoteUris), mutes)
    : [];
  const quoteViews = quoteRows.length
    ? await hydratePostViews(quoteRows, viewerDid, quoteDepth + 1, mutes)
    : [];
  const quoteByUri = new Map(quoteViews.map((view) => [view.uri, view]));
  return views.map((view, index) => {
    const quoteUri = rows[index].post.quoteUri;
    const quote = quoteUri ? quoteByUri.get(quoteUri) : undefined;
    const post = rows[index].post;
    const quotedNews =
      post.quoteUri && post.quoteCid
        ? newsViews.get(`${post.quoteUri}|${post.quoteCid}`)
        : undefined;
    return {
      ...view,
      ...(quote ? { quote: { kind: "post" as const, post: quote } } : {}),
      ...(quotedNews
        ? { quote: { kind: "news" as const, news: quotedNews } }
        : {}),
    };
  });
}
type BotReplyJob = { state: string; replyUri: string | null };
/** 元投稿 uri → botたん返信ジョブ（state/replyUri）。返信の indexed 済み判定・待機表示に使う。 */
export async function fetchBotReplyJobs(
  sourceUris: string[],
): Promise<Map<string, BotReplyJob>> {
  if (!sourceUris.length) return new Map();
  const jobs = await db
    .select({
      sourceUri: nagiBotReplyJobs.sourceUri,
      state: nagiBotReplyJobs.state,
      replyUri: nagiBotReplyJobs.replyUri,
    })
    .from(nagiBotReplyJobs)
    .where(inArray(nagiBotReplyJobs.sourceUri, sourceUris));
  return new Map(
    jobs.map((j) => [j.sourceUri, { state: j.state, replyUri: j.replyUri }]),
  );
}
export async function buildFeedItems(
  rows: PostRow[],
  viewerDid?: string,
  groupBotReplies = true,
  includeReplyParents = false,
  mutes: MuteSet = EMPTY_MUTES,
): Promise<FeedItem[]> {
  const jobByUri =
    groupBotReplies && rows.length
      ? await fetchBotReplyJobs(rows.map((r) => r.post.uri))
      : new Map<string, BotReplyJob>();
  const replyUris = new Set<string>();
  const parentUris = new Set<string>();
  for (const row of rows) {
    const replyUri = jobByUri.get(row.post.uri)?.replyUri ?? row.botReplyUri;
    if (groupBotReplies && replyUri) replyUris.add(replyUri);
    if (includeReplyParents && row.post.replyParentUri)
      parentUris.add(row.post.replyParentUri);
  }
  // 返信先がミュート著者なら replyParent を付けない（bot返信は bot 宛なので影響しない）。
  const relatedRows = dropMutedRows(
    await fetchPostRows([...new Set([...replyUris, ...parentUris])]),
    mutes,
  );
  const views = await hydratePostViews(
    [...rows, ...relatedRows],
    viewerDid,
    0,
    mutes,
  );
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
    if (reply && !reply.deleted)
      return { ...view, botReply: reply, botReplyState: "posted" };
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
/** スレッドキー = coalesce(replyRootUri, uri)。代表述語と揃える。 */
const threadKeyOf = (post: {
  uri: string;
  replyRootUri: string | null;
}): string => post.replyRootUri ?? post.uri;

/**
 * filter=posts はトップレベル投稿を先に選ぶ経路なので、後続返信を理由にそのルートを落とさない。
 * group は選ばれたルートへ会話を付加するためだけに使う。
 */
export const groupsByThreadActivity = (
  group: boolean | undefined,
  filter: "posts" | "replies" | "media" | undefined,
): boolean => Boolean(group && filter !== "posts");
/**
 * 指定スレッド(ルートURI)群に属する非削除投稿を全部引く。bot返信も含む（バブルにするため）。
 * ミュート著者の投稿はここで落とすので、バブルからその発言だけが抜け、totalCount/hiddenCount も
 * 自動的に整合する。ルートがミュートならルート行自体が引けず、呼び出し側でスレッドごと落ちる。
 */
async function fetchThreadRows(
  threadKeys: string[],
  mutes: MuteSet,
): Promise<PostRow[]> {
  if (!threadKeys.length) return [];
  return db
    .select(postSelection)
    .from(nagiPosts)
    .leftJoin(nagiActors, eq(nagiActors.did, nagiPosts.did))
    .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiPosts.did))
    .leftJoin(nagiPostScores, eq(nagiPostScores.postUri, nagiPosts.uri))
    .where(
      and(
        isNull(nagiPosts.deletedAt),
        ...(mutes.actors.length
          ? [notInArray(nagiPosts.did, mutes.actors)]
          : []),
        or(
          inArray(nagiPosts.replyRootUri, threadKeys),
          inArray(nagiPosts.uri, threadKeys),
        ),
      ),
    );
}
/**
 * 代表投稿(各スレッドの最新の共有可視投稿)群を、会話グループ FeedItem に組み立てる。
 * ルート + 最新3バブル(bot返信含む・createdAt昇順)に畳み、hiddenCount/totalCount を付ける。
 * botたん返信がまだ indexed されていない代表には awaitingBotReply を載せる。
 */
export async function buildConversationItems(
  reps: PostRow[],
  viewerDid?: string,
  mutes: MuteSet = EMPTY_MUTES,
): Promise<FeedItem[]> {
  if (!reps.length) return [];
  const threadKeys = [...new Set(reps.map((r) => threadKeyOf(r.post)))];
  const threadRows = await fetchThreadRows(threadKeys, mutes);
  // スレッドキーごとに投稿を集める（createdAt昇順・uriタイブレークで安定ソート）。
  const byThread = new Map<string, PostRow[]>();
  for (const row of threadRows) {
    const key = threadKeyOf(row.post);
    const list = byThread.get(key) ?? [];
    if (!byThread.has(key)) byThread.set(key, list);
    list.push(row);
  }
  const cmp = (a: PostRow, b: PostRow) => {
    const t =
      a.post.recordCreatedAt.getTime() - b.post.recordCreatedAt.getTime();
    return t !== 0 ? t : a.post.uri < b.post.uri ? -1 : 1;
  };
  // ルートからの返信ホップ数(=depth)。中間が畳まれても正しい深さを出すため、スレッド全体で計算。
  const parentByUri = new Map(
    threadRows.map((r) => [r.post.uri, r.post.replyParentUri]),
  );
  const depthFrom = (rootUri: string, uri: string): number => {
    let d = 0;
    let cur: string | null | undefined = uri;
    const seen = new Set<string>();
    while (cur && cur !== rootUri && !seen.has(cur)) {
      seen.add(cur);
      cur = parentByUri.get(cur);
      d++;
      if (d > 64) break; // 壊れた/循環参照の保険
    }
    return d;
  };
  // 表示対象(root + 最新3バブル + 代表)だけをまとめて1回でハイドレート。
  const displayRows = new Map<string, PostRow>();
  const plan = new Map<
    string,
    { rootUri: string; bubbleUris: string[]; bubbleDepths: number[]; total: number }
  >();
  for (const key of threadKeys) {
    const list = (byThread.get(key) ?? []).slice().sort(cmp);
    const root = list.find((r) => r.post.uri === key);
    // ルート削除済み/ルート著者ミュートのスレッドはここで落ちる（＝会話ごと非表示）。
    // どちらも getTimeline の filters で SQL 段階から除外済みなので、ここは安全網。
    if (!root) continue;
    const nonRoot = list.filter((r) => r.post.uri !== key);
    const bubbles = nonRoot.slice(-3);
    plan.set(key, {
      rootUri: key,
      bubbleUris: bubbles.map((r) => r.post.uri),
      bubbleDepths: bubbles.map((r) => depthFrom(key, r.post.uri)),
      total: list.length,
    });
    for (const r of [root, ...bubbles]) displayRows.set(r.post.uri, r);
  }
  for (const rep of reps) displayRows.set(rep.post.uri, rep);
  const views = await hydratePostViews(
    [...displayRows.values()],
    viewerDid,
    0,
    mutes,
  );
  const viewByUri = new Map(views.map((v) => [v.uri, v]));
  const jobByUri = await fetchBotReplyJobs(reps.map((r) => r.post.uri));
  return reps.flatMap((rep) => {
    const key = threadKeyOf(rep.post);
    const p = plan.get(key);
    const root = viewByUri.get(key);
    if (!p || !root) return []; // ルート未解決なら共有TLに出さない（安全側）。
    const bubbles = p.bubbleUris.flatMap((uri, i) => {
      const post = viewByUri.get(uri);
      return post ? [{ post, depth: p.bubbleDepths[i] }] : [];
    });
    const hiddenCount = Math.max(0, p.total - 1 - bubbles.length);
    // botたん返信が既にスレッド投稿として存在するなら待機表示は出さない。
    const threadUris = new Set(
      (byThread.get(key) ?? []).map((r) => r.post.uri),
    );
    const job = jobByUri.get(rep.post.uri);
    const replyUri = job?.replyUri ?? rep.botReplyUri ?? undefined;
    const awaitingBotReply =
      replyUri && threadUris.has(replyUri)
        ? undefined
        : job?.state === "failed"
          ? ("failed" as const)
          : job
            ? job.state === "processing"
              ? ("processing" as const)
              : ("pending" as const)
            : undefined;
    const conversation: ConversationView = {
      threadRootUri: key,
      root,
      bubbles,
      hiddenCount,
      totalCount: p.total,
      ...(awaitingBotReply ? { awaitingBotReply } : {}),
    };
    const repView = (viewByUri.get(rep.post.uri) ?? root) as FeedItem;
    return [{ ...repView, conversation }];
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
  /** タグ検索(/search): この小文字タグを含む投稿だけを出す。呼び出し側で小文字化済みであること。 */
  tag?: string;
  filter?: "posts" | "replies" | "media";
  /**
   * 会話グループ化。メイン共有TLでのみ true。各スレッドの最新の共有可視投稿だけを代表として
   * 1回だけ返し、buildConversationItems で会話ブロックに畳む。プロフィール/CH/検索/filter は false。
   */
  group?: boolean;
  /**
   * 本人向けホーム。指定時は本人・botたん・本人の非公開リストのルート投稿だけを候補にする。
   * 本人の kossori だけは表示するが、channelOnly は本人分も含めてホームへ出さない。
   */
  homeDid?: string;
  /** 呼び出し側が既に引いている場合に渡す。省略時は viewerDid から自分で引く。 */
  mutes?: MuteSet;
}) {
  const mutes = opts.mutes ?? (await loadMutes(opts.viewerDid));
  const homeActors = opts.homeDid
    ? [
        opts.homeDid,
        config.botDid,
        ...(await loadPrivateListMemberDids(opts.homeDid)),
      ]
    : undefined;
  // ミュートの適用範囲: プロフィールフィード(actorDid)は「自分で開いた」ので一切適用しない。
  // CH TL(channelUri)も同じ理由で CH ミュートは適用しないが、ユーザーミュートは効かせる。
  const muteActors = !opts.actorDid && mutes.actors.length > 0;
  const muteChannels =
    !opts.actorDid && !opts.channelUri && mutes.channels.length > 0;
  // ハイドレート側(バブル・引用・返信元)へ渡す実効ミュート。適用外の経路では空になるので、
  // プロフィールフィードでは SQL だけでなく後段の絞り込みも一切効かない。
  const appliedMutes: MuteSet = {
    actors: muteActors ? mutes.actors : [],
    channels: muteChannels ? mutes.channels : [],
  };
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
  if (opts.homeDid) {
    filters.push(...homeTimelineVisibility(opts.homeDid, homeActors!));
  }
  if (opts.channelUri) filters.push(eq(nagiPosts.channelUri, opts.channelUri));
  if (opts.tag)
    filters.push(sql`${nagiPosts.tags} @> ARRAY[${opts.tag}]::text[]`);
  if (opts.affirmation)
    filters.push(
      sql`${nagiPostScores.score} >= ${config.affirmationThreshold}`,
    );
  if (opts.filter === "posts") filters.push(isNull(nagiPosts.replyParentUri));
  if (opts.filter === "replies")
    filters.push(isNotNull(nagiPosts.replyParentUri));
  if (opts.filter === "media")
    filters.push(
      sql`jsonb_array_length(coalesce(${nagiPosts.embedImages}, '[]'::jsonb)) > 0`,
    );
  // ミュート（投稿者・スレッドルート著者・所属CH）。条件の組み立ては検索と共通。
  filters.push(
    ...muteVisibility(mutes, { actors: muteActors, channels: muteChannels }),
  );
  // Keep Bot replies grouped with their source post on shared timelines. An
  // explicit actor feed still needs them so the Bot profile's replies tab works.
  // CH TL も共有TL扱いで grouping する（botたんの返信は元投稿にまとめる）。
  if (!opts.actorDid)
    filters.push(
      or(ne(nagiPosts.did, config.botDid), isNull(nagiPosts.replyParentUri)),
    );
  // こっそりは返信ごとではなくスレッドルートが所有する。旧 channelOnly も互換性のため
  // ルートの非共有設定として扱う。ルート未解決時に true へ倒すのは、壊れた参照によって
  // 本来こっそりだった返信を共有TLへ露出させないため。
  if (!opts.actorDid && !opts.channelUri && !opts.homeDid) {
    filters.push(sql`
      case
        when ${nagiPosts.replyRootUri} is null
          then not (${nagiPosts.kossori} or ${nagiPosts.channelOnly})
        else coalesce((
          select not (thread_root.kossori or thread_root.channel_only)
          from nagi.posts as thread_root
          where thread_root.uri = ${nagiPosts.replyRootUri}
            and thread_root.deleted_at is null
        ), false)
      end
    `);
    // 将来チャンネル投稿をグローバル/全肯定TLへ流さない方針に変える場合は、
    // ここに filters.push(isNull(nagiPosts.channelUri)); を1行足すだけでよい。
  }
  // 会話グループ化: 同スレッドに自分より後の共有可視投稿(=非削除・非bot返信)が無い投稿=代表
  // だけを残す。これで1スレッド1回・最新活動順になる。cursor/orderBy はそのまま代表に効く。
  // kossori判定は上の case 式が担うので、ここでは重複して書かない。
  // ミュート著者の投稿は代表になれないので sib からも除く（1つ前へフォールバックさせる）。
  const sibMuteFilter = sibNotMuted(mutes, muteActors);
  const homeRootSibling = opts.homeDid
    ? sql` and sib.reply_parent_uri is null`
    : sql``;
  if (groupsByThreadActivity(opts.group, opts.filter))
    filters.push(sql`
      not exists (
        select 1 from nagi.posts as sib
        where coalesce(sib.reply_root_uri, sib.uri)
            = coalesce(${nagiPosts.replyRootUri}, ${nagiPosts.uri})
          and sib.deleted_at is null
          and (sib.did <> ${config.botDid} or sib.reply_parent_uri is null)${sibMuteFilter}
          ${homeRootSibling}
          and (
            sib.indexed_at > ${nagiPosts.indexedAt}
            or (sib.indexed_at = ${nagiPosts.indexedAt} and sib.uri > ${nagiPosts.uri})
          )
      )
    `);
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
    opts.group
      ? buildConversationItems(page, opts.viewerDid, appliedMutes)
      : buildFeedItems(
          page,
          opts.viewerDid,
          true,
          opts.filter === "replies" || Boolean(opts.channelUri),
          appliedMutes,
        ),
    getBotActor(),
  ]);
  const last = page.at(-1)?.post;
  return {
    items,
    botActor,
    cursor:
      rows.length > opts.limit && last
        ? encodeCursor(last.indexedAt, last.uri)
        : undefined,
    hasMore: rows.length > opts.limit,
  };
}

export async function getBotActor(): Promise<FeedItem["author"]> {
  const [actor, profile] = await Promise.all([
    db
      .select()
      .from(nagiActors)
      .where(eq(nagiActors.did, config.botDid))
      .limit(1),
    db
      .select()
      .from(nagiProfiles)
      .where(eq(nagiProfiles.did, config.botDid))
      .limit(1),
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
