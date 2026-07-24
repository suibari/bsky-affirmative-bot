import {
  db,
  nagiChannels,
  nagiDiaries,
  nagiEmojis,
  nagiIngestState,
  nagiNotifications,
  nagiNews,
  nagiPosts,
  nagiProcessedEvents,
  nagiProfiles,
  nagiReactions,
  nagiTranslations,
} from "@bsky-affirmative-bot/database";
import { BLUEMOJI_ITEM, NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { config } from "../config.js";
import { indexEmoji, resolveEmoji, type EmojiRow } from "../services/emoji.js";
import { dispatchPushAll, type PushJob } from "../services/pushDispatch.js";
import { validateRecord } from "./validateRecord.js";

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

export async function processEvent(evt: any) {
  const commit = evt.commit;
  if (!commit) return;
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
    return;
  const did = evt.did;
  // 日記を書けるのは botたんだけ。他人が他人の日記を捏造できないようにする。
  if (collection === NAGI.diary && did !== config.botDid) return;
  const uri = `at://${did}/${collection}/${commit.rkey}`;
  const id = `${did}:${evt.time_us}:${commit.rev ?? ""}:${collection}:${commit.rkey}`;
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
    if (!bluemoji) return;
  }
  // トランザクション内で実際に挿入できた通知だけを収集し、コミット成功後に
  // fire-and-forget でプッシュ配信する（重複挿入時は returning が空なので送らない）。
  const pushJobs: PushJob[] = [];
  await db.transaction(async (tx) => {
    const processed = await tx
      .select({ id: nagiProcessedEvents.id })
      .from(nagiProcessedEvents)
      .where(eq(nagiProcessedEvents.id, id))
      .limit(1);
    if (processed[0]) return;

    const existingPost =
      collection === NAGI.post
        ? await tx
            .select({ cid: nagiPosts.cid })
            .from(nagiPosts)
            .where(eq(nagiPosts.uri, uri))
            .limit(1)
        : [];
    if (commit.operation === "delete") {
      if (collection === NAGI.post) {
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
      if (collection === NAGI.news)
        await tx.update(nagiNews).set({ deletedAt: new Date() }).where(eq(nagiNews.uri, uri));
      // CH 削除はソフト削除。所属投稿の channel_uri はそのまま残す（通常投稿はグローバルに残る）。
      if (collection === NAGI.channel)
        await tx.update(nagiChannels).set({ deletedAt: new Date() }).where(eq(nagiChannels.uri, uri));
      if (collection === NAGI.profile)
        await tx.delete(nagiProfiles).where(eq(nagiProfiles.did, did));
      if (collection === BLUEMOJI_ITEM)
        await tx.delete(nagiEmojis).where(eq(nagiEmojis.uri, uri));
    } else if (validateRecord(collection, commit.record)) {
      const value: any = commit.record;
      const createdAt = new Date(value.createdAt);
      if (collection === NAGI.post) {
        if (existingPost[0] && existingPost[0].cid !== commit.cid) {
          await tx
            .delete(nagiTranslations)
            .where(eq(nagiTranslations.postUri, uri));
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
            quoteUri: value.embed?.$type === `${NAGI.post}#quote` ? value.embed.record.uri : null,
            quoteCid: value.embed?.$type === `${NAGI.post}#quote` ? value.embed.record.cid : null,
            kossori: value.kossori === true,
            channelUri: value.channel?.uri ?? null,
            channelOnly: value.channelOnly === true,
            repoRev: commit.rev,
            recordCreatedAt: createdAt,
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
              quoteUri: value.embed?.$type === `${NAGI.post}#quote` ? value.embed.record.uri : null,
              quoteCid: value.embed?.$type === `${NAGI.post}#quote` ? value.embed.record.cid : null,
              kossori: value.kossori === true,
              channelUri: value.channel?.uri ?? null,
              channelOnly: value.channelOnly === true,
              repoRev: commit.rev,
              recordCreatedAt: createdAt,
              deletedAt: null,
            },
          });
      }
      if (collection === NAGI.news) {
        const normalizedUrl = new URL(value.url);
        normalizedUrl.hash = "";
        ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => normalizedUrl.searchParams.delete(key));
        await tx.insert(nagiNews).values({
          uri, cid: commit.cid, rkey: commit.rkey, did,
          articleId: value.articleId, url: value.url, normalizedUrl: normalizedUrl.toString(),
          titleJa: value.titleJa, sourceName: value.sourceName ?? null,
          sourceUrl: value.sourceUrl ?? null,
          publishedAt: value.publishedAt ? new Date(value.publishedAt) : null,
          langs: value.langs, recordCreatedAt: createdAt, deletedAt: null,
        }).onConflictDoUpdate({
          target: nagiNews.uri,
          set: { cid: commit.cid, url: value.url, normalizedUrl: normalizedUrl.toString(), titleJa: value.titleJa,
            sourceName: value.sourceName ?? null, sourceUrl: value.sourceUrl ?? null,
            publishedAt: value.publishedAt ? new Date(value.publishedAt) : null,
            langs: value.langs, recordCreatedAt: createdAt, deletedAt: null },
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
              recordCreatedAt: createdAt,
              deletedAt: null,
            },
          });
      }
      if (collection === NAGI.reaction) {
        const emoji = bluemoji
          ? bluemoji.name
          : value.emoji.normalize("NFC");
        await tx
          .insert(nagiReactions)
          .values({
            uri,
            cid: commit.cid,
            did,
            subjectUri: value.subject.uri,
            emoji,
            emojiUri: bluemoji?.uri ?? null,
            emojiKey: bluemoji?.uri ?? emoji,
            createdAt,
          })
          .onConflictDoNothing();
      }
      if (collection === NAGI.diary) {
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
            langs: value.langs ?? null,
            recordCreatedAt: createdAt,
          })
          .onConflictDoUpdate({
            target: nagiDiaries.uri,
            set: {
              cid: commit.cid,
              text: value.text,
              titleJa: value.titleJa ?? null,
              titleEn: value.titleEn ?? null,
              langs: value.langs ?? null,
              recordCreatedAt: createdAt,
            },
          });
        // 日記はポストではないのでタイムラインには出ない。本人への通知だけが入口。
        if (value.subject !== did) {
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
              bodyText: preview(value.titleJa ?? value.titleEn ?? value.text),
            });
        }
      }
      if (collection === BLUEMOJI_ITEM) {
        // インデックスするのは Nagi ユーザーの絵文字のみ。それ以外はリアクション等で
        // 参照された時点でオンデマンドに取り込む（services/emoji.ts）。
        const profile = await tx
          .select({ did: nagiProfiles.did })
          .from(nagiProfiles)
          .where(eq(nagiProfiles.did, did))
          .limit(1);
        if (profile[0])
          await indexEmoji(tx, { uri, cid: commit.cid, did, record: value });
      }
      if (collection === NAGI.profile)
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
            },
          });
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
              bodyText: preview(value.text),
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
                bodyText: preview(value.text),
              });
          }
        }
      }
      if (collection === NAGI.reaction) {
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
              bodyText: bluemoji ? `:${bluemoji.name}:` : preview(value.emoji, 8),
            });
        }
      }
    }
    await tx
      .insert(nagiProcessedEvents)
      .values({ id, timeUs: Number(evt.time_us) })
      .onConflictDoNothing();
    await tx
      .insert(nagiIngestState)
      .values({ key: "jetstream", cursor: Number(evt.time_us) })
      .onConflictDoUpdate({
        target: nagiIngestState.key,
        set: { cursor: Number(evt.time_us), updatedAt: new Date() },
      });
  });
  // コミット後に配信。送信失敗はイングェストに影響させない。
  if (pushJobs.length) dispatchPushAll(pushJobs);
}
