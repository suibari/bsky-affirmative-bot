import {
  db,
  nagiChannels,
  nagiPosts,
} from "@bsky-affirmative-bot/database";
import type { MyNagiView } from "@bsky-affirmative-bot/nagi-lexicon";
import { and, inArray, isNull, sql } from "drizzle-orm";
import {
  buildConversationItems,
  fetchPostRows,
  homeTimelineVisibility,
} from "./timeline.js";
import { channelView } from "./channelView.js";
import { loadPrivateListMemberDids } from "./privateList.js";
import { loadSubscribedChannelUris } from "./channelSubscriptions.js";
import { loadMutes, muteVisibility } from "./mutes.js";

/**
 * my Nagi の「リスト動向」セクション。
 *
 * 既存の getHomeTimeline を limit=N で叩くだけだと活発な1人が枠を埋めてしまうので、
 * ここは 1人 / 1チャンネル につき最新1件だけを拾う（distinct on）。ページングはしない
 * ——「もっと見る」で既存のタイムラインへ送る前提の、顔ぶれを見せるための枠。
 */
const DEFAULT_LIMIT = 6;

export async function getMyNagi(opts: {
  viewerDid: string;
  limit?: number;
}): Promise<MyNagiView> {
  const limit = Math.min(20, Math.max(1, opts.limit ?? DEFAULT_LIMIT));
  const [memberDids, channelUris, mutes] = await Promise.all([
    loadPrivateListMemberDids(opts.viewerDid),
    loadSubscribedChannelUris(opts.viewerDid),
    loadMutes(opts.viewerDid),
  ]);

  const [listUsers, channels] = await Promise.all([
    latestPerListUser(opts.viewerDid, memberDids, limit, mutes),
    latestPerChannel(opts.viewerDid, channelUris, limit, mutes),
  ]);
  return { listUsers, channels };
}

async function latestPerListUser(
  viewerDid: string,
  memberDids: string[],
  limit: number,
  mutes: Awaited<ReturnType<typeof loadMutes>>,
): Promise<MyNagiView["listUsers"]> {
  if (!memberDids.length) return [];
  // 可視条件はホームタイムラインと完全に同じ（返信除外 / CH 限定除外 / 他人の kossori 除外）。
  // 自分自身と botたん は別セクションで出すので、ここでは非公開リストの人だけを見る。
  const rows = await db
    .selectDistinctOn([nagiPosts.did], {
      uri: nagiPosts.uri,
      did: nagiPosts.did,
    })
    .from(nagiPosts)
    .where(
      and(
        isNull(nagiPosts.deletedAt),
        ...homeTimelineVisibility(viewerDid, memberDids),
        ...muteVisibility(mutes, { actors: true, channels: true }),
      ),
    )
    .orderBy(nagiPosts.did, sql`${nagiPosts.recordCreatedAt} desc`);
  if (!rows.length) return [];

  const items = await buildConversationItems(
    await fetchPostRows(rows.map((row) => row.uri)),
    viewerDid,
    mutes,
  );
  // 1人1件になったところで、全体としては新着順に並べ替えてから上位を返す。
  return items
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit)
    .map((post) => ({ actor: post.author, post }));
}

async function latestPerChannel(
  viewerDid: string,
  channelUris: string[],
  limit: number,
  mutes: Awaited<ReturnType<typeof loadMutes>>,
): Promise<MyNagiView["channels"]> {
  if (!channelUris.length) return [];
  // CH の中では kossori も CH 限定も見える（getChannelTimeline と同じ扱い）。
  // ただし返信は代表に向かないので、トップレベルだけを拾う。
  const rows = await db
    .selectDistinctOn([nagiPosts.channelUri], {
      uri: nagiPosts.uri,
      channelUri: nagiPosts.channelUri,
    })
    .from(nagiPosts)
    .where(
      and(
        isNull(nagiPosts.deletedAt),
        isNull(nagiPosts.replyParentUri),
        inArray(nagiPosts.channelUri, channelUris),
        ...muteVisibility(mutes, { actors: true, channels: false }),
      ),
    )
    .orderBy(nagiPosts.channelUri, sql`${nagiPosts.recordCreatedAt} desc`);
  if (!rows.length) return [];

  const [items, channelRows] = await Promise.all([
    buildConversationItems(
      await fetchPostRows(rows.map((row) => row.uri)),
      viewerDid,
      mutes,
    ),
    db
      .select({
        uri: nagiChannels.uri,
        cid: nagiChannels.cid,
        did: nagiChannels.did,
        name: nagiChannels.name,
        description: nagiChannels.description,
        bannerCid: nagiChannels.bannerCid,
        pinnedPostUri: nagiChannels.pinnedPostUri,
        pinnedPostCid: nagiChannels.pinnedPostCid,
        recordCreatedAt: nagiChannels.recordCreatedAt,
        indexedAt: nagiChannels.indexedAt,
        lastPostAt: sql<Date | null>`null`,
      })
      .from(nagiChannels)
      .where(
        and(
          inArray(nagiChannels.uri, channelUris),
          isNull(nagiChannels.deletedAt),
        ),
      ),
  ]);
  const channelByUri = new Map(
    channelRows.map((row) => [
      row.uri,
      { ...channelView(row), viewerSubscribed: true },
    ]),
  );

  return items
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .flatMap((post) => {
      const channel = post.channel && channelByUri.get(post.channel.uri);
      return channel ? [{ channel, post }] : [];
    })
    .slice(0, limit);
}
