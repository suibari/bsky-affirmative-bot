import {
  db,
  nagiActors,
  nagiChannels,
  nagiMutes,
  nagiPosts,
  nagiProfiles,
} from "@bsky-affirmative-bot/database";
import {
  NAGI,
  type ActorView,
  type MuteSubjectType,
  type MutesView,
} from "@bsky-affirmative-bot/nagi-lexicon";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { ApiError } from "../middleware/errors.js";
import { channelView } from "./channelView.js";

/**
 * ビューアのミュート対象。**このデータが本人以外のレスポンスへ混ざらないよう注意すること**
 * （ミュートは非公開情報。フィルタ条件として使うだけで、一覧は getMutesView からしか出さない）。
 */
export type MuteSet = { actors: string[]; channels: string[] };
export const EMPTY_MUTES: MuteSet = { actors: [], channels: [] };

/**
 * ビューアのミュート一覧。未ログイン(viewerDid なし)なら空＝何もフィルタしない。
 * リクエストごとに1回だけ引き、各クエリへ MuteSet を渡し回す。
 */
export async function loadMutes(viewerDid?: string): Promise<MuteSet> {
  if (!viewerDid) return EMPTY_MUTES;
  const rows = await db
    .select({ subjectType: nagiMutes.subjectType, subject: nagiMutes.subject })
    .from(nagiMutes)
    .where(eq(nagiMutes.muterDid, viewerDid));
  if (!rows.length) return EMPTY_MUTES;
  return {
    actors: rows.flatMap((r) => (r.subjectType === "actor" ? [r.subject] : [])),
    channels: rows.flatMap((r) =>
      r.subjectType === "channel" ? [r.subject] : [],
    ),
  };
}

/**
 * ミュート対象 DID を text[] パラメータとして1回だけ束縛する。
 * sql.param が必須。素の配列を埋めると ($1, $2, ...) というレコード構成子に展開され、
 * text[] へのキャストが壊れる（ミュート1件のときだけ偶然動いてしまうので気付きにくい）。
 */
export const mutedActorsParam = (mutes: MuteSet) =>
  sql`${sql.param(mutes.actors)}::text[]`;

/**
 * 共有TL・検索に共通の、ミュート由来の可視性条件。and(...) にそのまま撒ける配列を返す。
 * 判定は3点:
 *  1. 投稿者本人がミュート対象なら出さない
 *  2. スレッドルートの著者がミュート対象なら、他人の返信もふくめて出さない
 *     （ルートを見たくない相手なら、その会話自体も興味がないという整理）
 *  3. 所属チャンネルがミュート対象なら出さない（channel_uri は NULL 可なので isNull を必ず OR する）
 * apply で経路ごとに切り替える: プロフィールフィードは両方 false、CH TL は channels だけ false。
 */
export function muteVisibility(
  mutes: MuteSet,
  apply: { actors: boolean; channels: boolean },
): SQL[] {
  const conditions: SQL[] = [];
  if (apply.actors && mutes.actors.length) {
    const actors = mutedActorsParam(mutes);
    conditions.push(notInArray(nagiPosts.did, mutes.actors));
    conditions.push(sql`
      case
        when ${nagiPosts.replyRootUri} is null then true
        else coalesce((
          select thread_root.did <> all(${actors})
          from nagi.posts as thread_root
          where thread_root.uri = ${nagiPosts.replyRootUri}
            and thread_root.deleted_at is null
        ), false)
      end
    `);
  }
  if (apply.channels && mutes.channels.length) {
    conditions.push(
      or(
        isNull(nagiPosts.channelUri),
        notInArray(nagiPosts.channelUri, mutes.channels),
      )!,
    );
  }
  return conditions;
}

/**
 * 会話グループ化の代表選出 `not exists (... sib ...)` に足す条件。
 * これが無いと、スレッドの最新投稿がミュート相手だったときに代表が1件も残らず、
 * スレッドごと TL から消える（1つ前の非ミュート投稿へフォールバックさせるための条件）。
 */
export const sibNotMuted = (mutes: MuteSet, apply: boolean) =>
  apply && mutes.actors.length
    ? sql` and sib.did <> all(${mutedActorsParam(mutes)})`
    : sql``;

/** 設定画面のミュート一覧。認証した本人の分しか組み立てないこと。 */
export async function getMutesView(viewerDid: string): Promise<MutesView> {
  const mutes = await loadMutes(viewerDid);
  const [actors, channels] = await Promise.all([
    fetchActorViews(mutes.actors),
    fetchChannelViews(mutes.channels),
  ]);
  return { actors, channels };
}

/** ミュート済みだが AppView 未取り込みの相手でも解除できるよう、行が無くても DID は返す。 */
async function fetchActorViews(dids: string[]): Promise<ActorView[]> {
  if (!dids.length) return [];
  const rows = await db
    .select({ actor: nagiActors, profile: nagiProfiles })
    .from(nagiActors)
    .leftJoin(nagiProfiles, eq(nagiProfiles.did, nagiActors.did))
    .where(inArray(nagiActors.did, dids));
  const byDid = new Map(rows.map((r) => [r.actor.did, r]));
  return dids.map((did) => {
    const row = byDid.get(did);
    return {
      did,
      handle: row?.actor.handle ?? did,
      ...(row?.profile?.displayName
        ? { displayName: row.profile.displayName }
        : {}),
      ...(row?.profile?.avatarCid
        ? {
            avatar: `/api/blob/${encodeURIComponent(did)}/${row.profile.avatarCid}`,
          }
        : {}),
    };
  });
}

/** 削除済みチャンネルもミュート行は残りうるので、deletedAt では絞らない（解除できるように）。 */
async function fetchChannelViews(uris: string[]) {
  if (!uris.length) return [];
  const lastPost = db
    .select({
      channelUri: nagiPosts.channelUri,
      lastPostAt: sql<Date>`max(${nagiPosts.indexedAt})`.as("last_post_at"),
    })
    .from(nagiPosts)
    .where(isNull(nagiPosts.deletedAt))
    .groupBy(nagiPosts.channelUri)
    .as("lp");
  const rows = await db
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
      lastPostAt: lastPost.lastPostAt,
    })
    .from(nagiChannels)
    .leftJoin(lastPost, eq(lastPost.channelUri, nagiChannels.uri))
    .where(inArray(nagiChannels.uri, uris))
    .orderBy(desc(nagiChannels.indexedAt));
  return rows.map((row) => ({ ...channelView(row), viewerMuted: true }));
}

/** ビューアがこの CH をミュートしているか（getChannel でミュート解除ボタンを出すため）。 */
export async function isChannelMuted(
  viewerDid: string | undefined,
  uri: string,
): Promise<boolean> {
  if (!viewerDid) return false;
  const rows = await db
    .select({ subject: nagiMutes.subject })
    .from(nagiMutes)
    .where(
      and(
        eq(nagiMutes.muterDid, viewerDid),
        eq(nagiMutes.subjectType, "channel"),
        eq(nagiMutes.subject, uri),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** ミュートの設定・解除。updateSeen と同じく冪等（二重実行しても同じ結果になる）。 */
export async function setMute(
  viewerDid: string,
  subjectType: MuteSubjectType,
  subject: string,
  muted: boolean,
): Promise<{ muted: boolean }> {
  if (subjectType === "actor") {
    if (!/^did:(plc|web):/.test(subject))
      throw new ApiError(400, "invalid_request", "subject must be a DID");
    if (subject === viewerDid)
      throw new ApiError(400, "invalid_request", "Cannot mute yourself");
  } else {
    if (!subject.startsWith("at://") || subject.split("/")[3] !== NAGI.channel)
      throw new ApiError(
        400,
        "invalid_request",
        "subject must be a channel AT-URI",
      );
  }
  if (muted) {
    await db
      .insert(nagiMutes)
      .values({ muterDid: viewerDid, subjectType, subject })
      .onConflictDoNothing();
  } else {
    await db
      .delete(nagiMutes)
      .where(
        and(
          eq(nagiMutes.muterDid, viewerDid),
          eq(nagiMutes.subjectType, subjectType),
          eq(nagiMutes.subject, subject),
        ),
      );
  }
  return { muted };
}
