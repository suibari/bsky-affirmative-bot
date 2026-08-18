import {
  db,
  nagiCardInstances,
  nagiProfiles,
} from "@bsky-affirmative-bot/database";
import {
  generateNagiCardComment,
  NAGI_CARD_COMMENT_PROMPT_VERSION,
} from "@bsky-affirmative-bot/bot-brain";
import {
  aiModel,
  anniversaryNames,
  isAnniversaryCard,
  parseAnniversaryCardNumber,
  resolveCardDef,
  SLOT_NAGI_REGISTERED_DAY,
  SLOT_USER_ANNIVERSARY,
} from "@bsky-affirmative-bot/shared-configs";
import { eq } from "drizzle-orm";

/**
 * 全肯定カードを引いた1枚に、botたんの吹き出しコメントを付ける。
 *
 * コメントはカード種ではなく **その1枚（card_instances の行）** に紐づく。だから
 * 交換で持ち主が変わってもコメントは付いていくし、同じカードでも人によって言葉が違う。
 * 引き直したときは AppView 側で comment を NULL に戻してから再エンキューされるので、
 * ここは常に「今の1枚に対する最新のひとこと」を書き込むだけでよい。
 */
/**
 * 記念日カードのプロンプト材料。カード名は「ハロウィン2026」だが、話題にさせたいのは
 * 年を含まない記念日そのものなので、slot から名前を引き直して渡す。
 */
function buildAnniversaryInput(
  cardNumber: number,
  label: string | null,
  joinedAt?: Date,
) {
  const { year, slot } = parseAnniversaryCardNumber(cardNumber);
  const names = anniversaryNames(slot, label ?? undefined);
  if (!names) return undefined;
  return {
    nameJa: names.ja,
    nameEn: names.en,
    year,
    isUserAnniversary: slot === SLOT_USER_ANNIVERSARY,
    ...(slot === SLOT_NAGI_REGISTERED_DAY && joinedAt
      ? { yearsSinceJoined: year - joinedAt.getUTCFullYear() }
      : {}),
  };
}

export async function runNagiCardComment(instanceId: string): Promise<void> {
  const [instance] = await db
    .select({
      cardVolume: nagiCardInstances.cardVolume,
      cardNumber: nagiCardInstances.cardNumber,
      ownerDid: nagiCardInstances.ownerDid,
      duplicateCount: nagiCardInstances.duplicateCount,
      anniversaryLabel: nagiCardInstances.anniversaryLabel,
    })
    .from(nagiCardInstances)
    .where(eq(nagiCardInstances.id, instanceId))
    .limit(1);

  if (!instance) {
    // 引いた本人がアカウントデータを消した等。失敗ではなくスキップ。
    console.log(
      `[INFO][NAGI][CARD] Instance ${instanceId} is gone; skipping comment.`,
    );
    return;
  }

  const card = resolveCardDef(
    instance.cardVolume,
    instance.cardNumber,
    instance.anniversaryLabel ?? undefined,
  );
  if (!card) {
    // 定義 JSON から番号が消えている（番号は変更禁止なので通常起きない）。
    throw new Error(`Unknown card v${instance.cardVolume}-${instance.cardNumber}`);
  }

  const [profile] = await db
    .select({
      displayName: nagiProfiles.displayName,
      createdAt: nagiProfiles.createdAt,
    })
    .from(nagiProfiles)
    .where(eq(nagiProfiles.did, instance.ownerDid))
    .limit(1);

  const result = await generateNagiCardComment({
    card,
    displayName: profile?.displayName || "きみ",
    isDuplicate: instance.duplicateCount > 1,
    // 記念日カードは「引き当てた1枚」ではなく「贈った1枚」なので、プロンプトの枠組みごと切り替える。
    ...(isAnniversaryCard(instance.cardVolume)
      ? {
          anniversary: buildAnniversaryInput(
            instance.cardNumber,
            instance.anniversaryLabel,
            profile?.createdAt,
          ),
        }
      : {}),
  });

  if (!result.commentJa && !result.commentEn) {
    throw new Error("generateNagiCardComment returned empty comment");
  }

  await db
    .update(nagiCardInstances)
    .set({
      commentJa: result.commentJa || null,
      commentEn: result.commentEn || null,
      commentModel: aiModel("NAGI_CARD_COMMENT"),
      commentPromptVersion: NAGI_CARD_COMMENT_PROMPT_VERSION,
    })
    .where(eq(nagiCardInstances.id, instanceId));
}
