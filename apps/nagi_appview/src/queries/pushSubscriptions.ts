import { db, nagiPushSubscriptions } from "@bsky-affirmative-bot/database";
import { eq } from "drizzle-orm";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** 購読を登録（endpoint が一意キー）。再購読で鍵が変わる場合に備え upsert する。 */
export async function upsertSubscription(did: string, sub: PushSubscriptionInput) {
  await db
    .insert(nagiPushSubscriptions)
    .values({
      endpoint: sub.endpoint,
      recipientDid: did,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    })
    .onConflictDoUpdate({
      target: nagiPushSubscriptions.endpoint,
      set: {
        recipientDid: did,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    });
  return { registered: true };
}

/** endpoint 指定で購読を削除。失効掃除とクライアントの解除の双方から呼ぶ。 */
export async function deleteSubscription(endpoint: string) {
  const result = await db
    .delete(nagiPushSubscriptions)
    .where(eq(nagiPushSubscriptions.endpoint, endpoint))
    .returning({ endpoint: nagiPushSubscriptions.endpoint });
  return { deleted: result.length };
}

/** 受信者 DID の全購読を返す（複数デバイス対応）。 */
export async function listSubscriptions(did: string) {
  return db
    .select({
      endpoint: nagiPushSubscriptions.endpoint,
      p256dh: nagiPushSubscriptions.p256dh,
      auth: nagiPushSubscriptions.auth,
    })
    .from(nagiPushSubscriptions)
    .where(eq(nagiPushSubscriptions.recipientDid, did));
}
