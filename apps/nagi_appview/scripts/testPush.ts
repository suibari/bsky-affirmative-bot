/**
 * 指定 DID の全購読へテスト通知を送る。
 *
 *   pnpm --filter nagi-appview test:push did:plc:xxxx [reply|reaction|mention|diary|analysis]
 *
 * 「サーバーは送っているのに端末に出ない」を切り分けるための手段。ログの accepted は
 * プッシュサービスが受理した数でしかなく、端末に表示されたかはサーバーから観測できない。
 * 実機を見ながら任意のタイミングで撃てる口が無いと、そこから先を確かめようがない。
 *
 * 同じ種別で連続2回撃つと通知タグの検証になる。2通とも個別にアラートされれば正常、
 * 2通目が無音で差し替わるなら tag が一意になっていない（pushPayload.ts のコメント参照）。
 */
import { initializeDatabases } from "@bsky-affirmative-bot/database";
import { randomUUID } from "node:crypto";
import { dispatchPush } from "../src/services/pushDispatch.js";
import type { PushNotificationType } from "../src/services/pushPayload.js";

const TYPES: PushNotificationType[] = ["reply", "reaction", "mention", "diary", "analysis"];

const recipientDid = process.argv[2];
const type = (process.argv[3] ?? "reply") as PushNotificationType;

if (!recipientDid?.startsWith("did:")) {
  console.error("usage: test:push <recipient-did> [reply|reaction|mention|diary|analysis]");
  process.exit(1);
}
if (!TYPES.includes(type)) {
  console.error(`unknown type: ${type} (expected one of ${TYPES.join(", ")})`);
  process.exit(1);
}

await initializeDatabases();

await dispatchPush({
  recipientDid,
  type,
  // 送信元は受信者自身にしておく。実在アクターなら表示名が引かれ、いなければ
  // "だれか" になるだけで、配信経路の検証には影響しない。
  actorDid: recipientDid,
  // 実在の通知行ではないのでその場で採番する。tag の一意性さえ満たせばよい。
  notificationId: randomUUID(),
  bodyText: `テスト通知 ${new Date().toLocaleTimeString("ja-JP")}`,
});

process.exit(0);
