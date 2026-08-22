import { createHash } from "node:crypto";
import { db, nagiPushSubscriptions } from "@bsky-affirmative-bot/database";
import { and, eq, isNull, ne, or } from "drizzle-orm";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushInstallationInput {
  installationId: string;
  capability: string;
}

export const hashPushCapability = (capability: string): string =>
  createHash("sha256").update(capability, "utf8").digest("hex");

/**
 * OAuth認証済みの本人が購読を登録する。installation情報を送らない旧クライアントも
 * 受け付け、新クライアントが次に起動した時点で同じendpoint行をcapability方式へ移行する。
 */
export async function upsertSubscription(
  did: string,
  sub: PushSubscriptionInput,
  installation?: PushInstallationInput,
) {
  const now = new Date();
  return db.transaction(async (tx) => {
    if (installation) {
      const [existingInstallation] = await tx
        .select({
          endpoint: nagiPushSubscriptions.endpoint,
          recipientDid: nagiPushSubscriptions.recipientDid,
        })
        .from(nagiPushSubscriptions)
        .where(
          eq(nagiPushSubscriptions.installationId, installation.installationId),
        )
        .limit(1);

      if (existingInstallation) {
        if (existingInstallation.recipientDid !== did) {
          return {
            registered: false as const,
            reason: "installation_conflict" as const,
          };
        }
        if (existingInstallation.endpoint !== sub.endpoint) {
          const [endpointOwner] = await tx
            .select({ recipientDid: nagiPushSubscriptions.recipientDid })
            .from(nagiPushSubscriptions)
            .where(eq(nagiPushSubscriptions.endpoint, sub.endpoint))
            .limit(1);
          if (endpointOwner && endpointOwner.recipientDid !== did) {
            return {
              registered: false as const,
              reason: "endpoint_conflict" as const,
            };
          }
        }
        // endpointローテーション先に同じ利用者の旧行があれば先に畳む。
        await tx
          .delete(nagiPushSubscriptions)
          .where(
            and(
              eq(nagiPushSubscriptions.endpoint, sub.endpoint),
              eq(nagiPushSubscriptions.recipientDid, did),
              or(
                isNull(nagiPushSubscriptions.installationId),
                ne(
                  nagiPushSubscriptions.installationId,
                  installation.installationId,
                ),
              ),
            ),
          );
        await tx
          .update(nagiPushSubscriptions)
          .set({
            endpoint: sub.endpoint,
            recipientDid: did,
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
            capabilityHash: hashPushCapability(installation.capability),
            updatedAt: now,
            lastConfirmedAt: now,
            invalidatedAt: null,
            invalidationReason: null,
          })
          .where(
            eq(
              nagiPushSubscriptions.installationId,
              installation.installationId,
            ),
          );
        return { registered: true as const };
      }
    }

    await tx
      .insert(nagiPushSubscriptions)
      .values({
        endpoint: sub.endpoint,
        recipientDid: did,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        installationId: installation?.installationId,
        capabilityHash: installation
          ? hashPushCapability(installation.capability)
          : undefined,
        updatedAt: now,
        lastConfirmedAt: now,
      })
      .onConflictDoUpdate({
        target: nagiPushSubscriptions.endpoint,
        set: {
          recipientDid: did,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          installationId: installation?.installationId,
          capabilityHash: installation
            ? hashPushCapability(installation.capability)
            : undefined,
          updatedAt: now,
          lastConfirmedAt: now,
          invalidatedAt: null,
          invalidationReason: null,
        },
      });
    return { registered: true as const };
  });
}

/** Service WorkerがOAuthなしで、自分のinstallationの購読先だけを更新する。 */
export async function refreshSubscription(
  installation: PushInstallationInput,
  sub: PushSubscriptionInput,
) {
  const capabilityHash = hashPushCapability(installation.capability);
  const now = new Date();
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        endpoint: nagiPushSubscriptions.endpoint,
        recipientDid: nagiPushSubscriptions.recipientDid,
      })
      .from(nagiPushSubscriptions)
      .where(
        and(
          eq(nagiPushSubscriptions.installationId, installation.installationId),
          eq(nagiPushSubscriptions.capabilityHash, capabilityHash),
          isNull(nagiPushSubscriptions.invalidatedAt),
        ),
      )
      .limit(1);
    if (!current)
      return {
        registered: false as const,
        reason: "invalid_capability" as const,
      };

    if (current.endpoint !== sub.endpoint) {
      const [conflict] = await tx
        .select({ recipientDid: nagiPushSubscriptions.recipientDid })
        .from(nagiPushSubscriptions)
        .where(eq(nagiPushSubscriptions.endpoint, sub.endpoint))
        .limit(1);
      if (conflict && conflict.recipientDid !== current.recipientDid) {
        return {
          registered: false as const,
          reason: "endpoint_conflict" as const,
        };
      }
      if (conflict) {
        await tx
          .delete(nagiPushSubscriptions)
          .where(eq(nagiPushSubscriptions.endpoint, sub.endpoint));
      }
    }

    await tx
      .update(nagiPushSubscriptions)
      .set({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        updatedAt: now,
        lastConfirmedAt: now,
      })
      .where(
        and(
          eq(nagiPushSubscriptions.installationId, installation.installationId),
          eq(nagiPushSubscriptions.capabilityHash, capabilityHash),
          isNull(nagiPushSubscriptions.invalidatedAt),
        ),
      );
    return { registered: true as const };
  });
}

/** 明示OFF/サインアウト。履歴は残し、capabilityは再利用不能にする。 */
export async function invalidateInstallation(
  installation: PushInstallationInput,
  reason = "explicit_unsubscribe",
) {
  const now = new Date();
  const result = await db
    .update(nagiPushSubscriptions)
    .set({
      capabilityHash: null,
      invalidatedAt: now,
      invalidationReason: reason,
      updatedAt: now,
    })
    .where(
      and(
        eq(nagiPushSubscriptions.installationId, installation.installationId),
        eq(
          nagiPushSubscriptions.capabilityHash,
          hashPushCapability(installation.capability),
        ),
        isNull(nagiPushSubscriptions.invalidatedAt),
      ),
    )
    .returning({ endpoint: nagiPushSubscriptions.endpoint });
  return { deleted: result.length };
}

/** 旧クライアントの認証済み解除。endpointだけで他ユーザーの行を消せないようDIDも照合する。 */
export async function invalidateOwnSubscription(did: string, endpoint: string) {
  const now = new Date();
  const result = await db
    .update(nagiPushSubscriptions)
    .set({
      capabilityHash: null,
      invalidatedAt: now,
      invalidationReason: "explicit_unsubscribe",
      updatedAt: now,
    })
    .where(
      and(
        eq(nagiPushSubscriptions.endpoint, endpoint),
        eq(nagiPushSubscriptions.recipientDid, did),
        isNull(nagiPushSubscriptions.invalidatedAt),
      ),
    )
    .returning({ endpoint: nagiPushSubscriptions.endpoint });
  return { deleted: result.length };
}

export async function invalidateSubscription(endpoint: string, reason: string) {
  const now = new Date();
  await db
    .update(nagiPushSubscriptions)
    .set({
      capabilityHash: null,
      invalidatedAt: now,
      invalidationReason: reason,
      updatedAt: now,
    })
    .where(eq(nagiPushSubscriptions.endpoint, endpoint));
}

export async function markSubscriptionSuccess(endpoint: string) {
  const now = new Date();
  await db
    .update(nagiPushSubscriptions)
    .set({ lastSuccessAt: now, updatedAt: now })
    .where(eq(nagiPushSubscriptions.endpoint, endpoint));
}

/** 受信者 DID の有効な購読だけを返す（複数デバイス対応）。 */
export async function listSubscriptions(did: string) {
  return db
    .select({
      endpoint: nagiPushSubscriptions.endpoint,
      p256dh: nagiPushSubscriptions.p256dh,
      auth: nagiPushSubscriptions.auth,
    })
    .from(nagiPushSubscriptions)
    .where(
      and(
        eq(nagiPushSubscriptions.recipientDid, did),
        isNull(nagiPushSubscriptions.invalidatedAt),
      ),
    );
}
