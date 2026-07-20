import {
  db,
  nagiIngestState,
  nagiNotifications,
  nagiPosts,
  nagiProcessedEvents,
  nagiProfiles,
  nagiReactions,
  nagiTranslations,
} from "@bsky-affirmative-bot/database";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { validateRecord } from "./validateRecord.js";

export async function processEvent(evt: any) {
  const commit = evt.commit;
  if (!commit) return;
  const collection = commit.collection;
  if (![NAGI.post, NAGI.reaction, NAGI.profile].includes(collection)) return;
  const did = evt.did;
  const uri = `at://${did}/${collection}/${commit.rkey}`;
  const id = `${did}:${evt.time_us}:${commit.rev ?? ""}:${collection}:${commit.rkey}`;
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
      if (collection === NAGI.profile)
        await tx.delete(nagiProfiles).where(eq(nagiProfiles.did, did));
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
            langs: value.langs,
            recordJson: value,
            replyRootUri: value.reply?.root.uri,
            replyParentUri: value.reply?.parent.uri,
            embedImages: value.embed?.images,
            quoteUri: value.embed?.record?.uri,
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
              langs: value.langs,
              recordJson: value,
              replyRootUri: value.reply?.root.uri ?? null,
              replyParentUri: value.reply?.parent.uri ?? null,
              embedImages: value.embed?.images ?? null,
              quoteUri: value.embed?.record?.uri ?? null,
              repoRev: commit.rev,
              recordCreatedAt: createdAt,
              deletedAt: null,
            },
          });
      }
      if (collection === NAGI.reaction)
        await tx
          .insert(nagiReactions)
          .values({
            uri,
            cid: commit.cid,
            did,
            subjectUri: value.subject.uri,
            emoji: value.emoji.normalize("NFC"),
            createdAt,
          })
          .onConflictDoNothing();
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
          await tx
            .insert(nagiNotifications)
            .values({
              recipientDid: parent[0].did,
              type: "reply",
              actorDid: did,
              subjectUri: parent[0].uri,
              reasonUri: uri,
            })
            .onConflictDoNothing();
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
          for (const { did: recipientDid } of profiles)
            await tx
              .insert(nagiNotifications)
              .values({
                recipientDid,
                type: "mention",
                actorDid: did,
                subjectUri: uri,
                reasonUri: uri,
              })
              .onConflictDoNothing();
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
        if (subject[0] && subject[0].did !== did)
          await tx
            .insert(nagiNotifications)
            .values({
              recipientDid: subject[0].did,
              type: "reaction",
              actorDid: did,
              subjectUri: subject[0].uri,
              reasonUri: uri,
            })
            .onConflictDoNothing();
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
}
