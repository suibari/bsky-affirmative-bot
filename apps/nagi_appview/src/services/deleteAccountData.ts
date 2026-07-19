import {
  db,
  nagiActors,
  nagiBotReplyJobs,
  nagiNotifications,
  nagiPosts,
  nagiPostScores,
  nagiProfiles,
  nagiReactions,
  nagiTranslations,
} from "@bsky-affirmative-bot/database";
import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import { eq, like, or } from "drizzle-orm";

export async function deleteAccountData(did: string) {
  await db.transaction(async (tx) => {
    const postUri = `at://${did}/${NAGI.post}/%`;
    const reactionUri = `at://${did}/${NAGI.reaction}/%`;

    await tx.delete(nagiTranslations).where(like(nagiTranslations.postUri, postUri));
    await tx.delete(nagiPostScores).where(like(nagiPostScores.postUri, postUri));
    await tx.delete(nagiBotReplyJobs).where(like(nagiBotReplyJobs.sourceUri, postUri));
    await tx.delete(nagiReactions).where(like(nagiReactions.subjectUri, postUri));
    await tx.delete(nagiBotReplyJobs).where(eq(nagiBotReplyJobs.authorDid, did));
    await tx
      .delete(nagiNotifications)
      .where(
        or(
          eq(nagiNotifications.recipientDid, did),
          eq(nagiNotifications.actorDid, did),
          like(nagiNotifications.subjectUri, postUri),
          like(nagiNotifications.reasonUri, postUri),
          like(nagiNotifications.reasonUri, reactionUri),
        ),
      );
    await tx.delete(nagiReactions).where(eq(nagiReactions.did, did));
    await tx.delete(nagiPosts).where(eq(nagiPosts.did, did));
    await tx.delete(nagiProfiles).where(eq(nagiProfiles.did, did));
    await tx.delete(nagiActors).where(eq(nagiActors.did, did));
  });

  return { success: true as const };
}
