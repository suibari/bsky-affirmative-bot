import {
  db,
  nagiActors,
  nagiActorAnalyses,
  nagiAnalysisJobs,
  nagiDiaries,
  nagiBotReplyJobs,
  nagiEmojis,
  nagiNotifications,
  nagiPosts,
  nagiPostScores,
  nagiProfiles,
  nagiReactions,
  nagiTranslations,
} from "@bsky-affirmative-bot/database";
import { BLUEMOJI_ITEM, NAGI } from "@bsky-affirmative-bot/nagi-lexicon";
import { eq, like, or } from "drizzle-orm";

const NAGI_BOT_SERVER_URL = process.env.NAGI_BOT_SERVER_URL || "http://localhost:3003";

/**
 * 日記は botたんのリポジトリにあるので、AppView からは消せない。
 * bot サーバーに依頼する。DB の行を消す前に呼ぶこと（rkey を行から引くため）。
 */
async function purgeDiaryRecords(did: string) {
  try {
    const response = await fetch(`${NAGI_BOT_SERVER_URL}/diaries/purge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ did }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    // 失敗しても AppView 側の削除は続ける（表示上は消える）。取り残したレコードは
    // /diaries/purge を手で叩けば回収できる。
    console.error(`[ERROR][NAGI][DIARY] Failed to purge diary records for ${did}:`, error);
  }
}

export async function deleteAccountData(did: string) {
  await purgeDiaryRecords(did);
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
    // 自分のカスタム絵文字と、それを使った他ユーザーのリアクションも消す。
    await tx
      .delete(nagiReactions)
      .where(like(nagiReactions.emojiUri, `at://${did}/${BLUEMOJI_ITEM}/%`));
    await tx.delete(nagiEmojis).where(eq(nagiEmojis.did, did));
    await tx.delete(nagiDiaries).where(eq(nagiDiaries.subjectDid, did));
    await tx.delete(nagiPosts).where(eq(nagiPosts.did, did));
    await tx.delete(nagiAnalysisJobs).where(eq(nagiAnalysisJobs.did, did));
    await tx.delete(nagiActorAnalyses).where(eq(nagiActorAnalyses.did, did));
    await tx.delete(nagiProfiles).where(eq(nagiProfiles.did, did));
    await tx.delete(nagiActors).where(eq(nagiActors.did, did));
  });

  return { success: true as const };
}
