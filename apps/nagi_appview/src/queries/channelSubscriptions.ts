import {
  db,
  nagiChannelSubscriptions,
  nagiChannels,
} from "@bsky-affirmative-bot/database";
import {
  CHANNEL_SUBSCRIPTION_LIMIT,
  type SetChannelSubscriptionResult,
} from "@bsky-affirmative-bot/nagi-lexicon";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { ApiError } from "../middleware/errors.js";

/**
 * 購読中チャンネル。設計は privateList.ts をそのまま踏襲している
 * （PDS レコードにしない・owner は必ず viewerDid・所有者単位で直列化）。
 */
export async function loadSubscribedChannelUris(
  ownerDid: string,
): Promise<string[]> {
  const rows = await db
    .select({ channelUri: nagiChannelSubscriptions.channelUri })
    .from(nagiChannelSubscriptions)
    .where(eq(nagiChannelSubscriptions.ownerDid, ownerDid));
  return rows.map((row) => row.channelUri);
}

/** 渡した URI のうち、そのビューアが購読しているものだけを返す（ChannelView の付加情報用）。 */
export async function loadSubscribedAmong(
  ownerDid: string,
  channelUris: string[],
): Promise<Set<string>> {
  if (!channelUris.length) return new Set();
  const rows = await db
    .select({ channelUri: nagiChannelSubscriptions.channelUri })
    .from(nagiChannelSubscriptions)
    .where(
      and(
        eq(nagiChannelSubscriptions.ownerDid, ownerDid),
        inArray(nagiChannelSubscriptions.channelUri, channelUris),
      ),
    );
  return new Set(rows.map((row) => row.channelUri));
}

export function assertChannelSubscriptionCapacity(count: number) {
  if (count >= CHANNEL_SUBSCRIPTION_LIMIT)
    throw new ApiError(
      409,
      "channel_subscription_limit",
      `Channel subscriptions are limited to ${CHANNEL_SUBSCRIPTION_LIMIT}`,
    );
}

/**
 * 参加・解除は所有者単位で直列化する。件数確認と insert の間に並行追加が入って
 * 上限を超えないよう、owner DID の hash を transaction advisory lock に使う。
 */
export async function setChannelSubscription(
  ownerDid: string,
  uri: string,
  subscribed: boolean,
): Promise<SetChannelSubscriptionResult> {
  if (!uri.startsWith("at://"))
    throw new ApiError(400, "invalid_request", "uri must be an AT-URI");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerDid}))`);
    if (!subscribed) {
      await tx
        .delete(nagiChannelSubscriptions)
        .where(
          and(
            eq(nagiChannelSubscriptions.ownerDid, ownerDid),
            eq(nagiChannelSubscriptions.channelUri, uri),
          ),
        );
      return { uri, subscribed: false };
    }

    const existing = await tx
      .select({ channelUri: nagiChannelSubscriptions.channelUri })
      .from(nagiChannelSubscriptions)
      .where(
        and(
          eq(nagiChannelSubscriptions.ownerDid, ownerDid),
          eq(nagiChannelSubscriptions.channelUri, uri),
        ),
      )
      .limit(1);
    if (existing.length) return { uri, subscribed: true };

    const channel = await tx
      .select({ uri: nagiChannels.uri })
      .from(nagiChannels)
      .where(and(eq(nagiChannels.uri, uri), isNull(nagiChannels.deletedAt)))
      .limit(1);
    if (!channel.length)
      throw new ApiError(404, "channel_not_found", "Channel not found");

    const [count] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(nagiChannelSubscriptions)
      .where(eq(nagiChannelSubscriptions.ownerDid, ownerDid));
    assertChannelSubscriptionCapacity(count?.value ?? 0);

    await tx
      .insert(nagiChannelSubscriptions)
      .values({ ownerDid, channelUri: uri })
      .onConflictDoNothing();
    return { uri, subscribed: true };
  });
}
