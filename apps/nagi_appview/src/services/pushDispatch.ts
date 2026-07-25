import webpush from "web-push";
import { db, nagiActors, nagiProfiles } from "@bsky-affirmative-bot/database";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { deleteSubscription, listSubscriptions } from "../queries/pushSubscriptions.js";
import { loadMutes } from "../queries/mutes.js";

let configured = false;
let warnedMissingConfig = false;
/** VAPID 未設定ならプッシュ配信を無効化（通知の挿入自体は従来どおり続く）。 */
function ensureConfigured(): boolean {
  if (!config.vapid) {
    if (!warnedMissingConfig) {
      console.warn("[push] delivery disabled: VAPID keys are not configured");
      warnedMissingConfig = true;
    }
    return false;
  }
  if (!configured) {
    webpush.setVapidDetails(
      config.vapid.subject,
      config.vapid.publicKey,
      config.vapid.privateKey,
    );
    configured = true;
  }
  return true;
}

export type PushNotificationType = "reply" | "reaction" | "mention" | "diary";

export interface PushJob {
  recipientDid: string;
  type: PushNotificationType;
  actorDid: string;
  /** 本文プレビュー（返信/メンションはポスト本文、リアクションは絵文字、日記はタイトル）。 */
  bodyText?: string;
}

const NOTIF_URL = "/notifications";

async function actorName(did: string): Promise<string> {
  const [profile] = await db
    .select({ displayName: nagiProfiles.displayName })
    .from(nagiProfiles)
    .where(eq(nagiProfiles.did, did))
    .limit(1);
  if (profile?.displayName) return profile.displayName;
  const [actor] = await db
    .select({ handle: nagiActors.handle })
    .from(nagiActors)
    .where(eq(nagiActors.did, did))
    .limit(1);
  return actor?.handle ?? "だれか";
}

// プッシュ文面はサーバー側で組み立てる（受信者の locale を持たないため日本語既定）。
function compose(type: PushNotificationType, name: string, body: string) {
  switch (type) {
    case "reply":
      return { title: `${name}さんが返信しました`, body };
    case "mention":
      return { title: `${name}さんがあなたをメンションしました`, body };
    case "reaction":
      return { title: `${name}さんがリアクションしました`, body };
    case "diary":
      return { title: "botたんが日記を書きました", body };
  }
}

/**
 * 受信者の全購読へ Web Push を送信する。fire-and-forget 前提で呼び、失効した購読
 * (404/410) は掃除する。VAPID 未設定・購読ゼロなら何もしない。
 */
export async function dispatchPush(job: PushJob): Promise<void> {
  if (!ensureConfigured()) return;
  // 通知一覧に出ないものはプッシュも送らない。ingest のトランザクション外なので、
  // ここでミュートを引いてもホットパスは重くならない。
  const mutes = await loadMutes(job.recipientDid);
  if (mutes.actors.includes(job.actorDid)) return;
  const subs = await listSubscriptions(job.recipientDid);
  if (!subs.length) return;
  const name = await actorName(job.actorDid);
  const { title, body } = compose(job.type, name, job.bodyText ?? "");
  const payload = JSON.stringify({ title, body, type: job.type, url: NOTIF_URL });
  let sent = 0;
  let expired = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent += 1;
      } catch (e: any) {
        const status = e?.statusCode;
        if (status === 404 || status === 410) {
          await deleteSubscription(sub.endpoint).catch(() => {});
          expired += 1;
        } else {
          failed += 1;
          console.error("[push] send failed", status, e?.body ?? e?.message);
        }
      }
    }),
  );
  console.info(
    `[push] dispatch type=${job.type} subscriptions=${subs.length} sent=${sent} expired=${expired} failed=${failed}`,
  );
}

/** 複数ジョブをまとめて非同期発火。イングェストをブロックしないよう待たない用途で使う。 */
export function dispatchPushAll(jobs: PushJob[]): void {
  for (const job of jobs)
    void dispatchPush(job).catch((error) => {
      console.error(`[push] dispatch failed type=${job.type}`, error);
    });
}
