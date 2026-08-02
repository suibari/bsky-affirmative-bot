import {
  db,
  nagiActorAnalyses,
  nagiAnalysisJobs,
  nagiChannels,
  nagiCommunityAffirmations,
  nagiDiaries,
  nagiEmojis,
  nagiIngestState,
  nagiNotifications,
  nagiNews,
  nagiNewsReviewJobs,
  nagiPosts,
  nagiProcessedEvents,
  nagiProfiles,
  nagiReactions,
  nagiTranslations,
} from "@bsky-affirmative-bot/database";
import { BLUEMOJI_ITEM, NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { config } from "../config.js";
import { indexEmoji, resolveEmoji, type EmojiRow } from "../services/emoji.js";
import { dispatchPushAll, type PushJob } from "../services/pushDispatch.js";
import {
  shouldStartEnglishPrewarm,
  startEnglishPrewarm,
} from "../services/translation.js";
import { reconciledIndexedAt } from "./reconcileOrder.js";
import { shouldAcceptSemanticRecord } from "./semanticRecord.js";
import { validateRecord } from "./validateRecord.js";
import {
  hasContentWarning,
  parseContentWarning,
} from "../util/contentWarning.js";

/** プッシュ本文用に長い本文を詰める。 */
const preview = (text: unknown, max = 80): string => {
  const s = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

/**
 * facets の #tag feature から小文字タグ配列を抽出する（/search 用のインデックス列）。
 * マッチングは小文字で正規化し、重複は除く。tag が無ければ null（列は NULL のまま）。
 */
const extractTags = (facets: unknown): string[] | null => {
  if (!Array.isArray(facets)) return null;
  const tags = new Set<string>();
  for (const facet of facets) {
    if (!Array.isArray(facet?.features)) continue;
    for (const feature of facet.features) {
      if (
        feature?.$type === "app.bsky.richtext.facet#tag" &&
        typeof feature.tag === "string"
      ) {
        const tag = feature.tag.trim().toLowerCase();
        if (tag) tags.add(tag);
      }
    }
  }
  return tags.size ? [...tags] : null;
};

export type ApplyMutationOptions = {
  trackJetstream?: boolean;
  emitPush?: boolean;
  reconcile?: boolean;
};

export async function applyMutation(
  evt: any,
  {
    trackJetstream = false,
    emitPush = false,
    reconcile = false,
  }: ApplyMutationOptions = {},
): Promise<{ cursorAdvanced: boolean }> {
  const commit = evt.commit;
  if (!commit) return { cursorAdvanced: false };
  const collection = commit.collection;
  if (
    ![
      NAGI.post,
      NAGI.reaction,
      NAGI.profile,
      BLUEMOJI_ITEM,
      NAGI.diary,
      NAGI.news,
      NAGI.channel,
    ].includes(collection)
  )
    return { cursorAdvanced: false };
  const did = evt.did;
  // 日記を書けるのは botたんだけ。他人が他人の日記を捏造できないようにする。
  if (collection === NAGI.diary && did !== config.botDid)
    return { cursorAdvanced: false };
  const uri = `at://${did}/${collection}/${commit.rkey}`;
  if (
    collection === NAGI.post &&
    commit.operation !== "delete" &&
    typeof commit.record?.text === "string"
  ) {
    const warning = parseContentWarning(commit.record.text);
    if (warning.status === "invalid") {
      console.warn(
        `[content-warning] ignored invalid syntax uri=${uri} reason=${warning.reason}`,
      );
    }
  }
  const id = trackJetstream
    ? `${did}:${evt.time_us}:${commit.rev ?? ""}:${collection}:${commit.rkey}`
    : undefined;
  // カスタム絵文字の解決は元 PDS への fetch を伴うことがあるので、トランザクションの外で行う。
  // 自己申告の値は使わず、インデックス済みの item だけを信頼する。
  let bluemoji: EmojiRow | null = null;
  if (
    collection === NAGI.reaction &&
    commit.operation !== "delete" &&
    validateRecord(collection, commit.record) &&
    (commit.record as any).bluemoji
  ) {
    bluemoji = await resolveEmoji((commit.record as any).bluemoji.uri);
    if (!bluemoji) return { cursorAdvanced: false };
  }
  if (
    collection === NAGI.post &&
    commit.operation !== "delete" &&
    validateRecord(collection, commit.record)
  ) {
    const refs = new Map<string, { cid: string; name: string; did: string }>();
    for (const facet of (commit.record as any).facets ?? []) {
      for (const feature of facet.features ?? []) {
        if (feature?.$type !== "com.suibari.nagi.richtext#bluemoji") continue;
        refs.set(feature.ref.uri, {
          cid: feature.ref.cid,
          name: feature.name,
          did: feature.did,
        });
      }
    }
    for (const [emojiUri, expected] of refs) {
      const resolved = await resolveEmoji(emojiUri);
      if (
        !resolved ||
        resolved.cid !== expected.cid ||
        resolved.name !== expected.name ||
        resolved.did !== expected.did ||
        resolved.adultOnly
      )
        return { cursorAdvanced: false };
    }
  }
  // トランザクション内で実際に挿入できた通知だけを収集し、コミット成功後に
  // fire-and-forget でプッシュ配信する（重複挿入時は returning が空なので送らない）。
  const pushJobs: PushJob[] = [];
  const englishPrewarmUris: string[] = [];
  await db.transaction(async (tx) => {
    let semanticRecordAccepted = true;
    const processed = id
      ? await tx
          .select({ id: nagiProcessedEvents.id })
          .from(nagiProcessedEvents)
          .where(eq(nagiProcessedEvents.id, id))
          .limit(1)
      : [];
    if (processed[0]) {
      await tx
        .insert(nagiIngestState)
        .values({ key: "jetstream", cursor: Number(evt.time_us) })
        .onConflictDoUpdate({
          target: nagiIngestState.key,
          set: {
            cursor: sql`greatest(${nagiIngestState.cursor}, excluded.cursor)`,
            updatedAt: new Date(),
          },
        });
      return;
    }

    const existingPost =
      collection === NAGI.post
        ? await tx
            .select({ cid: nagiPosts.cid })
            .from(nagiPosts)
            .where(eq(nagiPosts.uri, uri))
            .limit(1)
        : [];
    // プロフィールの初回作成＝Nagi 初回登録。初回だけ自動分析（Bluesky投稿）をキューする。
    const existingProfile =
      collection === NAGI.profile
        ? await tx
            .select({ did: nagiProfiles.did })
            .from(nagiProfiles)
            .where(eq(nagiProfiles.did, did))
            .limit(1)
        : [];
    if (commit.operation === "delete") {
      if (collection === NAGI.post) {
        const quotingSourceUris = (
          await tx
            .select({ uri: nagiPosts.uri })
            .from(nagiPosts)
            .where(eq(nagiPosts.quoteUri, uri))
        ).map((row) => row.uri);
        await tx
          .update(nagiPosts)
          .set({
            text: "",
            facets: null,
            embedImages: null,
            recordJson: null,
            deletedAt: new Date(),
          })
          .where(eq(nagiPosts.uri, uri));
        await tx
          .delete(nagiTranslations)
          .where(eq(nagiTranslations.postUri, uri));
        await tx
          .delete(nagiNotifications)
          .where(eq(nagiNotifications.subjectUri, uri));
        await tx
          .delete(nagiCommunityAffirmations)
          .where(eq(nagiCommunityAffirmations.sourceUri, uri));
        if (quotingSourceUris.length)
          await tx
            .delete(nagiCommunityAffirmations)
            .where(
              inArray(nagiCommunityAffirmations.sourceUri, quotingSourceUris),
            );
      }
      if (collection === NAGI.reaction) {
        await tx.delete(nagiReactions).where(eq(nagiReactions.uri, uri));
        await tx
          .delete(nagiNotifications)
          .where(eq(nagiNotifications.reasonUri, uri));
      }
      if (collection === NAGI.diary) {
        await tx.delete(nagiDiaries).where(eq(nagiDiaries.uri, uri));
        await tx
          .delete(nagiNotifications)
          .where(eq(nagiNotifications.reasonUri, uri));
      }
      if (collection === NAGI.news) {
        await tx
          .update(nagiNews)
          .set({ deletedAt: new Date() })
          .where(eq(nagiNews.uri, uri));
        await tx
          .update(nagiNewsReviewJobs)
          .set({ status: "cancelled", reasonCode: "record_deleted", finishedAt: new Date() })
          .where(eq(nagiNewsReviewJobs.newsUri, uri));
      }
      // CH 削除はソフト削除。所属投稿の channel_uri はそのまま残す（通常投稿はグローバルに残る）。
      if (collection === NAGI.channel)
        await tx
          .update(nagiChannels)
          .set({ deletedAt: new Date() })
          .where(eq(nagiChannels.uri, uri));
      if (collection === NAGI.profile)
        await tx.delete(nagiProfiles).where(eq(nagiProfiles.did, did));
      if (collection === BLUEMOJI_ITEM)
        await tx.delete(nagiEmojis).where(eq(nagiEmojis.uri, uri));
    } else if (validateRecord(collection, commit.record)) {
      const value: any = commit.record;
      const createdAt = new Date(value.createdAt);
      const reconciledPostIndexedAt =
        reconcile && collection === NAGI.post
          ? reconciledIndexedAt(createdAt)
          : undefined;
      if (collection === NAGI.post) {
        // 既存投稿 かつ cid が変わった＝投稿後編集。翻訳キャッシュ破棄と edited フラグ立てに使う。
        const isEdit = !!existingPost[0] && existingPost[0].cid !== commit.cid;
        if (isEdit) {
          const quotingSourceUris = (
            await tx
              .select({ uri: nagiPosts.uri })
              .from(nagiPosts)
              .where(eq(nagiPosts.quoteUri, uri))
          ).map((row) => row.uri);
          await tx
            .delete(nagiTranslations)
            .where(eq(nagiTranslations.postUri, uri));
          // 旧CIDの要約は即時非表示にするが、作者24時間1生成のクールダウンは残す。
          // 行を消すと編集直後に再生成できてしまうため、期限後にworkerが新CIDへ差し替える。
          await tx
            .update(nagiCommunityAffirmations)
            .set({
              state: "rejected",
              summaryJa: null,
              summaryEn: null,
              leaseExpiresAt: null,
              lastError: "source_edited",
              updatedAt: new Date(),
            })
            .where(eq(nagiCommunityAffirmations.sourceUri, uri));
          if (quotingSourceUris.length)
            await tx
              .update(nagiCommunityAffirmations)
              .set({
                state: "rejected",
                summaryJa: null,
                summaryEn: null,
                leaseExpiresAt: null,
                lastError: "quoted_source_edited",
                updatedAt: new Date(),
              })
              .where(
                inArray(nagiCommunityAffirmations.sourceUri, quotingSourceUris),
              );
        }
        await tx
          .insert(nagiPosts)
          .values({
            uri,
            cid: commit.cid,
            rkey: commit.rkey,
            did,
            text: value.text,
            facets: value.facets,
            tags: extractTags(value.facets),
            langs: value.langs,
            recordJson: value,
            replyRootUri: value.reply?.root.uri,
            replyParentUri: value.reply?.parent.uri,
            embedImages: value.embed?.images,
            quoteUri:
              value.embed?.$type === `${NAGI.post}#quote`
                ? value.embed.record.uri
                : null,
            quoteCid:
              value.embed?.$type === `${NAGI.post}#quote`
                ? value.embed.record.cid
                : null,
            kossori: value.kossori === true,
            channelUri: value.channel?.uri ?? null,
            channelOnly: value.channelOnly === true,
            repoRev: commit.rev,
            recordCreatedAt: createdAt,
            ...(reconciledPostIndexedAt
              ? { indexedAt: reconciledPostIndexedAt }
              : {}),
            edited: false,
            deletedAt: null,
          })
          .onConflictDoUpdate({
            target: nagiPosts.uri,
            set: {
              cid: commit.cid,
              text: value.text,
              facets: value.facets,
              tags: extractTags(value.facets),
              langs: value.langs,
              recordJson: value,
              replyRootUri: value.reply?.root.uri ?? null,
              replyParentUri: value.reply?.parent.uri ?? null,
              embedImages: value.embed?.images ?? null,
              quoteUri:
                value.embed?.$type === `${NAGI.post}#quote`
                  ? value.embed.record.uri
                  : null,
              quoteCid:
                value.embed?.$type === `${NAGI.post}#quote`
                  ? value.embed.record.cid
                  : null,
              kossori: value.kossori === true,
              channelUri: value.channel?.uri ?? null,
              channelOnly: value.channelOnly === true,
              repoRev: commit.rev,
              recordCreatedAt: createdAt,
              // cid 変化を観測した編集で true。cid 不変の再処理ではフラグを戻さない（単調）。
              edited: isEdit ? true : sql`${nagiPosts.edited}`,
              // 本文が変わった編集では意味検索の埋め込みを無効化し、EmbeddingWorker に
              // 新しい本文で再生成させる。cid 不変の再処理では既存埋め込みを保持する。
              ...(isEdit ? { embedding: null } : {}),
              deletedAt: null,
            },
          });
        if (
          shouldStartEnglishPrewarm(
            Boolean(existingPost[0]),
            reconcile,
            value.langs,
          ) &&
          !hasContentWarning(value.text)
        ) {
          englishPrewarmUris.push(uri);
        }
        // 新規投稿が 100 の倍数に到達したら自動分析（Nagi投稿+リアクション）をキューする。
        // 編集(existingPost)ではカウントが変わらないので発火させない。件数は
        // プロフィールの postCount と同条件（非削除の全投稿）で数える。
        if (!existingPost[0] && did !== config.botDid) {
          const [counted] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(nagiPosts)
            .where(and(eq(nagiPosts.did, did), isNull(nagiPosts.deletedAt)));
          const count = counted?.count ?? 0;
          if (count > 0 && count % 100 === 0) {
            await tx
              .insert(nagiAnalysisJobs)
              .values({
                id: `${did}#nagi#${count}`,
                did,
                source: "nagi",
                postCountAt: count,
              })
              .onConflictDoNothing();
          }
        }
      }
      if (collection === NAGI.news) {
        const normalizedUrl = new URL(value.url);
        normalizedUrl.hash = "";
        [
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_term",
          "utm_content",
        ].forEach((key) => normalizedUrl.searchParams.delete(key));
        await tx
          .insert(nagiNews)
          .values({
            uri,
            cid: commit.cid,
            rkey: commit.rkey,
            did,
            articleId: value.articleId,
            url: value.url,
            normalizedUrl: normalizedUrl.toString(),
            titleJa: value.titleJa,
            sourceName: value.sourceName ?? null,
            sourceUrl: value.sourceUrl ?? null,
            publishedAt: value.publishedAt ? new Date(value.publishedAt) : null,
            langs: value.langs,
            recordCreatedAt: createdAt,
            deletedAt: null,
          })
          .onConflictDoUpdate({
            target: nagiNews.uri,
            set: {
              cid: commit.cid,
              url: value.url,
              normalizedUrl: normalizedUrl.toString(),
              titleJa: value.titleJa,
              sourceName: value.sourceName ?? null,
              sourceUrl: value.sourceUrl ?? null,
              publishedAt: value.publishedAt
                ? new Date(value.publishedAt)
                : null,
              langs: value.langs,
              recordCreatedAt: createdAt,
              deletedAt: null,
              // 意味検索の埋め込みソース(titleJa)が変わったら再生成させる。
              embedding: sql`case when ${nagiNews.titleJa} is distinct from excluded.title_ja then null else ${nagiNews.embedding} end`,
            },
          });
      }
      if (collection === NAGI.channel) {
        await tx
          .insert(nagiChannels)
          .values({
            uri,
            cid: commit.cid,
            rkey: commit.rkey,
            did,
            name: value.name,
            description: value.description ?? null,
            bannerCid: value.banner?.ref?.$link ?? null,
            pinnedPostUri: value.pinnedPost?.uri ?? null,
            pinnedPostCid: value.pinnedPost?.cid ?? null,
            recordCreatedAt: createdAt,
            deletedAt: null,
          })
          .onConflictDoUpdate({
            target: nagiChannels.uri,
            set: {
              cid: commit.cid,
              name: value.name,
              description: value.description ?? null,
              bannerCid: value.banner?.ref?.$link ?? null,
              pinnedPostUri: value.pinnedPost?.uri ?? null,
              pinnedPostCid: value.pinnedPost?.cid ?? null,
              recordCreatedAt: createdAt,
              deletedAt: null,
              // 意味検索の埋め込みソース(name/description)が変わったら再生成させる。
              embedding: sql`case when (${nagiChannels.name} is distinct from excluded.name) or (${nagiChannels.description} is distinct from excluded.description) then null else ${nagiChannels.embedding} end`,
            },
          });
      }
      if (collection === NAGI.reaction) {
        const emoji = bluemoji ? bluemoji.name : value.emoji.normalize("NFC");
        const emojiKey = bluemoji?.uri ?? emoji;
        const existing = await tx
          .select({
            uri: nagiReactions.uri,
            did: nagiReactions.did,
            subjectUri: nagiReactions.subjectUri,
            emojiKey: nagiReactions.emojiKey,
            createdAt: nagiReactions.createdAt,
          })
          .from(nagiReactions)
          .where(
            or(
              eq(nagiReactions.uri, uri),
              and(
                eq(nagiReactions.did, did),
                eq(nagiReactions.subjectUri, value.subject.uri),
                eq(nagiReactions.emojiKey, emojiKey),
              ),
            ),
          );
        const sameUri = existing.find((row) => row.uri === uri);
        const sameMeaning = existing.find(
          (row) =>
            row.did === did &&
            row.subjectUri === value.subject.uri &&
            row.emojiKey === emojiKey,
        );
        semanticRecordAccepted = shouldAcceptSemanticRecord(sameMeaning, {
          uri,
          createdAt,
        });
        if (!semanticRecordAccepted) {
          // 同じ URI の内容が別の意味キーへ変更された場合、古い投影だけは残さない。
          if (sameUri && sameUri.uri !== sameMeaning?.uri) {
            await tx
              .delete(nagiNotifications)
              .where(eq(nagiNotifications.reasonUri, sameUri.uri));
            await tx
              .delete(nagiReactions)
              .where(eq(nagiReactions.uri, sameUri.uri));
          }
        } else {
          if (
            sameUri &&
            (sameUri.did !== did ||
              sameUri.subjectUri !== value.subject.uri ||
              sameUri.emojiKey !== emojiKey)
          )
            await tx
              .delete(nagiNotifications)
              .where(eq(nagiNotifications.reasonUri, sameUri.uri));
          if (sameMeaning && sameMeaning.uri !== uri) {
            await tx
              .delete(nagiNotifications)
              .where(eq(nagiNotifications.reasonUri, sameMeaning.uri));
            await tx
              .delete(nagiReactions)
              .where(eq(nagiReactions.uri, sameMeaning.uri));
          }
          await tx
            .insert(nagiReactions)
            .values({
              uri,
              cid: commit.cid,
              did,
              subjectUri: value.subject.uri,
              emoji,
              emojiUri: bluemoji?.uri ?? null,
              emojiKey,
              createdAt,
            })
            .onConflictDoUpdate({
              target: nagiReactions.uri,
              set: {
                cid: commit.cid,
                subjectUri: value.subject.uri,
                emoji,
                emojiUri: bluemoji?.uri ?? null,
                emojiKey,
                createdAt,
              },
            });
        }
      }
      if (collection === NAGI.diary) {
        const existing = await tx
          .select({
            uri: nagiDiaries.uri,
            subjectDid: nagiDiaries.subjectDid,
            diaryDate: nagiDiaries.diaryDate,
            createdAt: nagiDiaries.recordCreatedAt,
          })
          .from(nagiDiaries)
          .where(
            or(
              eq(nagiDiaries.uri, uri),
              and(
                eq(nagiDiaries.subjectDid, value.subject),
                eq(nagiDiaries.diaryDate, value.date),
              ),
            ),
          );
        const sameUri = existing.find((row) => row.uri === uri);
        const sameMeaning = existing.find(
          (row) =>
            row.subjectDid === value.subject && row.diaryDate === value.date,
        );
        semanticRecordAccepted = shouldAcceptSemanticRecord(sameMeaning, {
          uri,
          createdAt,
        });
        if (!semanticRecordAccepted) {
          if (sameUri && sameUri.uri !== sameMeaning?.uri) {
            await tx
              .delete(nagiNotifications)
              .where(eq(nagiNotifications.reasonUri, sameUri.uri));
            await tx
              .delete(nagiDiaries)
              .where(eq(nagiDiaries.uri, sameUri.uri));
          }
        } else {
          if (
            sameUri &&
            (sameUri.subjectDid !== value.subject ||
              sameUri.diaryDate !== value.date)
          )
            await tx
              .delete(nagiNotifications)
              .where(eq(nagiNotifications.reasonUri, sameUri.uri));
          if (sameMeaning && sameMeaning.uri !== uri) {
            await tx
              .delete(nagiNotifications)
              .where(eq(nagiNotifications.reasonUri, sameMeaning.uri));
            await tx
              .delete(nagiDiaries)
              .where(eq(nagiDiaries.uri, sameMeaning.uri));
          }
          await tx
            .insert(nagiDiaries)
            .values({
              uri,
              cid: commit.cid,
              did,
              subjectDid: value.subject,
              diaryDate: value.date,
              text: value.text,
              titleJa: value.titleJa ?? null,
              titleEn: value.titleEn ?? null,
              emoji: value.emoji ?? null,
              postCount: value.postCount ?? null,
              langs: value.langs ?? null,
              recordCreatedAt: createdAt,
            })
            .onConflictDoUpdate({
              target: nagiDiaries.uri,
              set: {
                cid: commit.cid,
                subjectDid: value.subject,
                diaryDate: value.date,
                text: value.text,
                titleJa: value.titleJa ?? null,
                titleEn: value.titleEn ?? null,
                emoji: value.emoji ?? null,
                postCount: value.postCount ?? null,
                langs: value.langs ?? null,
                recordCreatedAt: createdAt,
              },
            });
        }
        // 日記はポストではないのでタイムラインには出ない。本人への通知だけが入口。
        if (semanticRecordAccepted && value.subject !== did) {
          const inserted = await tx
            .insert(nagiNotifications)
            .values({
              recipientDid: value.subject,
              type: "diary",
              actorDid: did,
              subjectUri: uri,
              reasonUri: uri,
            })
            .onConflictDoNothing()
            .returning({ id: nagiNotifications.id });
          if (inserted.length)
            pushJobs.push({
              recipientDid: value.subject,
              type: "diary",
              actorDid: did,
              notificationId: inserted[0].id,
              bodyText: preview(value.titleJa ?? value.titleEn ?? value.text),
            });
        }
      }
      if (collection === BLUEMOJI_ITEM) {
        // インデックスするのは Nagi ユーザーの絵文字のみ。それ以外はリアクション等で
        // 参照された時点でオンデマンドに取り込む（services/emoji.ts）。参照によって
        // 取り込み済みの外部絵文字は、PDS照合や update で最新値へ追従させる。
        const [profile, existingEmoji] = await Promise.all([
          tx
            .select({ did: nagiProfiles.did })
            .from(nagiProfiles)
            .where(eq(nagiProfiles.did, did))
            .limit(1),
          tx
            .select({ uri: nagiEmojis.uri })
            .from(nagiEmojis)
            .where(eq(nagiEmojis.uri, uri))
            .limit(1),
        ]);
        if (profile[0] || existingEmoji[0])
          await indexEmoji(tx, { uri, cid: commit.cid, did, record: value });
      }
      if (collection === NAGI.profile) {
        await tx
          .insert(nagiProfiles)
          .values({
            did,
            displayName: value.displayName,
            description: value.description,
            avatarCid: value.avatar?.ref?.$link,
            createdAt,
          })
          .onConflictDoUpdate({
            target: nagiProfiles.did,
            set: {
              displayName: value.displayName,
              description: value.description,
              avatarCid: value.avatar?.ref?.$link,
              // 意味検索の埋め込みソース(displayName/description)が変わったら再生成させる
              // （analysisJa 側の更新は NagiAnalysisFeature が別途 NULL リセットする）。
              embedding: sql`case when (${nagiProfiles.displayName} is distinct from excluded.display_name) or (${nagiProfiles.description} is distinct from excluded.description) then null else ${nagiProfiles.embedding} end`,
            },
          });
        // 初回登録（プロフィール新規作成）時のみ、Bluesky 投稿を対象に自動分析をキューする。
        // 既に分析済みなら再登録でも再実行しない（job id と分析行の両方で冪等）。
        if (!existingProfile[0] && did !== config.botDid) {
          const existingAnalysis = await tx
            .select({ did: nagiActorAnalyses.did })
            .from(nagiActorAnalyses)
            .where(eq(nagiActorAnalyses.did, did))
            .limit(1);
          if (!existingAnalysis[0]) {
            await tx
              .insert(nagiAnalysisJobs)
              .values({ id: `${did}#first`, did, source: "bluesky" })
              .onConflictDoNothing();
          }
        }
      }
      let replyRecipientDid: string | undefined;
      if (collection === NAGI.post && value.reply?.parent?.uri) {
        const parent = await tx
          .select()
          .from(nagiPosts)
          .where(
            and(
              eq(nagiPosts.uri, value.reply.parent.uri),
              isNull(nagiPosts.deletedAt),
            ),
          )
          .limit(1);
        if (parent[0] && parent[0].did !== did) {
          replyRecipientDid = parent[0].did;
          const inserted = await tx
            .insert(nagiNotifications)
            .values({
              recipientDid: parent[0].did,
              type: "reply",
              actorDid: did,
              subjectUri: parent[0].uri,
              reasonUri: uri,
            })
            .onConflictDoNothing()
            .returning({ id: nagiNotifications.id });
          if (inserted.length)
            pushJobs.push({
              recipientDid: parent[0].did,
              type: "reply",
              actorDid: did,
              notificationId: inserted[0].id,
              bodyText: hasContentWarning(value.text)
                ? ""
                : preview(value.text),
            });
        }
      }
      if (collection === NAGI.post && Array.isArray(value.facets)) {
        const mentionedDids = [
          ...new Set<string>(
            value.facets.flatMap((facet: any) =>
              Array.isArray(facet?.features)
                ? facet.features
                    .filter(
                      (feature: any) =>
                        feature?.$type === "app.bsky.richtext.facet#mention" &&
                        typeof feature.did === "string",
                    )
                    .map((feature: any) => feature.did as string)
                : [],
            ),
          ),
        ].filter(
          (recipientDid) =>
            recipientDid !== did && recipientDid !== replyRecipientDid,
        );
        if (mentionedDids.length) {
          const profiles = await tx
            .select({ did: nagiProfiles.did })
            .from(nagiProfiles)
            .where(inArray(nagiProfiles.did, mentionedDids));
          for (const { did: recipientDid } of profiles) {
            const inserted = await tx
              .insert(nagiNotifications)
              .values({
                recipientDid,
                type: "mention",
                actorDid: did,
                subjectUri: uri,
                reasonUri: uri,
              })
              .onConflictDoNothing()
              .returning({ id: nagiNotifications.id });
            if (inserted.length)
              pushJobs.push({
                recipientDid,
                type: "mention",
                actorDid: did,
                notificationId: inserted[0].id,
                bodyText: hasContentWarning(value.text)
                  ? ""
                  : preview(value.text),
              });
          }
        }
      }
      if (collection === NAGI.reaction && semanticRecordAccepted) {
        const subject = await tx
          .select()
          .from(nagiPosts)
          .where(
            and(
              eq(nagiPosts.uri, value.subject.uri),
              isNull(nagiPosts.deletedAt),
            ),
          )
          .limit(1);
        if (subject[0] && subject[0].did !== did) {
          const inserted = await tx
            .insert(nagiNotifications)
            .values({
              recipientDid: subject[0].did,
              type: "reaction",
              actorDid: did,
              subjectUri: subject[0].uri,
              reasonUri: uri,
            })
            .onConflictDoNothing()
            .returning({ id: nagiNotifications.id });
          if (inserted.length)
            pushJobs.push({
              recipientDid: subject[0].did,
              type: "reaction",
              actorDid: did,
              notificationId: inserted[0].id,
              bodyText: bluemoji
                ? `:${bluemoji.name}:`
                : preview(value.emoji, 8),
            });
        }
      }
    }
    if (id) {
      await tx
        .insert(nagiProcessedEvents)
        .values({ id, timeUs: Number(evt.time_us) })
        .onConflictDoNothing();
      await tx
        .insert(nagiIngestState)
        .values({ key: "jetstream", cursor: Number(evt.time_us) })
        .onConflictDoUpdate({
          target: nagiIngestState.key,
          set: {
            cursor: sql`greatest(${nagiIngestState.cursor}, excluded.cursor)`,
            updatedAt: new Date(),
          },
        });
    }
  });
  // コミット後に配信。送信失敗はイングェストに影響させない。
  if (emitPush && pushJobs.length) dispatchPushAll(pushJobs);
  for (const postUri of englishPrewarmUris) startEnglishPrewarm(postUri);
  return { cursorAdvanced: trackJetstream };
}
