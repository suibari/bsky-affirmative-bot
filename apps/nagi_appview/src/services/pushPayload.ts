/**
 * Web Push で端末へ送る payload の唯一の定義。
 *
 * ⚠ この型は nagi_client/src/service-worker.ts の PushPayload と対になっている。
 *    両者は別リポジトリなので型を共有できない。フィールドを足す・変える・消すときは
 *    必ず両方を更新すること。加えて受信側（SW）には常に「古いサーバーが送った payload」
 *    が届きうる前提でフォールバックを残す。SW の更新は端末に行き渡るまで時間がかかり、
 *    サーバーだけ先に進む状況が普通に起きる。
 *
 * ⚠ tag は「通知1件ごとに一意」でなければならない。
 *    Notifications 仕様では、同じ tag の通知がすでに表示されている状態で
 *    showNotification すると、既存の通知を静かに置き換えるだけで再アラートしない。
 *    音もバイブもバナーも出ないので、ユーザーからは「通知が来ない」ように見える。
 *    かつてここが種別名（reply/diary/...）だったため、2通目以降がすべて無音で
 *    潰れるという障害を起こした。tag には必ず通知レコードの id を含めること。
 *
 *    通知の同一性を決めるのはこの payload を作るサーバー側であって、SW ではない。
 *    SW に「何をもって同じ通知とみなすか」を判断させると、判断材料が足りないまま
 *    推測することになり、同じ事故が再発する。
 */

/** 通知種別。nagi.notifications.type と対応する。 */
export type PushNotificationType = "reply" | "reaction" | "mention" | "diary";

export interface PushPayload {
  title: string;
  body: string;
  type: PushNotificationType;
  /** 通知1件ごとに一意。理由は上のコメントを必ず読むこと。 */
  tag: string;
  /** 通知タップ時に開くパス。 */
  url: string;
}

/** 通知一覧ページ。今はすべての通知がここへ着地する。 */
const NOTIF_URL = "/notifications";

/**
 * payload を組み立てる唯一の入口。文面はサーバー側で作る（受信者の locale を
 * 持たないため日本語既定）。
 *
 * @param notificationId nagi.notifications.id（uuid）。tag の一意性の担保はこれだけ
 *   なので、呼び出し側で必ず実レコードの id を渡すこと。
 */
export function buildPushPayload(input: {
  type: PushNotificationType;
  notificationId: string;
  actorName: string;
  bodyText: string;
}): PushPayload {
  const { type, notificationId, actorName, bodyText } = input;
  return {
    ...compose(type, actorName, bodyText),
    type,
    tag: `${type}-${notificationId}`,
    url: NOTIF_URL,
  };
}

function compose(
  type: PushNotificationType,
  name: string,
  body: string,
): { title: string; body: string } {
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
