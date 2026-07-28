import { Router } from "express";
import { db, nagiNotifications } from "@bsky-affirmative-bot/database";
import { config } from "../config.js";
import { dispatchPush } from "../services/pushDispatch.js";

/**
 * サービス間通信専用のルーター。ユーザー向け XRPC とは違い service auth を持たない。
 *
 * 認可は「127.0.0.1 にしか束縛しない」ことだけで担保する（index.ts で公開ポートとは
 * 別のリスナーに載せる）。nagi_bot_server の内部 HTTP と同じやり方で、共有シークレットを
 * 環境変数で配るより OS に閉じてもらうほうが確実だし、覚える設定も増えない。
 *
 * ⚠ このルーターを公開リスナー側に mount してはいけない。認可が消える。
 */
export const internal = Router();

/**
 * 自動分析（名刺）の更新通知を作る。
 *
 * 他の通知はすべて Jetstream ingest が作るが、分析結果は PDS レコードではなく AppView の
 * Postgres にしか無いので ingest イベントが発生しない。生成側（nagi_bot_server）から
 * ここを叩いてもらうことで、通知行の挿入と Web Push の送出は AppView が持ち続ける。
 */
internal.post("/notifications/analysis", async (req, res, next) => {
  try {
    const did = String(req.body?.did ?? "");
    const updatedAt = String(req.body?.updatedAt ?? "");
    const bodyText =
      typeof req.body?.bodyText === "string" ? req.body.bodyText : "";
    if (!did.startsWith("did:")) {
      res.status(400).json({ error: "did is required" });
      return;
    }
    if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
      res.status(400).json({ error: "updatedAt must be an ISO timestamp" });
      return;
    }

    // reasonUri に updatedAt を含めることで、(recipientDid, reasonUri) の unique index が
    // そのまま「同じ分析では通知を増やさない」冪等性になる。分析が再実行されれば
    // updatedAt が変わるので新しい通知が1件出る。
    const inserted = await db
      .insert(nagiNotifications)
      .values({
        recipientDid: did,
        type: "analysis",
        actorDid: config.botDid,
        subjectUri: `at://${did}`,
        reasonUri: `at://${did}/analysis/${updatedAt}`,
      })
      .onConflictDoNothing()
      .returning({ id: nagiNotifications.id });

    if (!inserted.length) {
      res.status(200).json({ created: false });
      return;
    }

    // ingest 側と同じく fire-and-forget。プッシュの失敗で通知そのものを取り消さない。
    void dispatchPush({
      recipientDid: did,
      type: "analysis",
      actorDid: config.botDid,
      notificationId: inserted[0].id,
      bodyText,
    });

    res.status(200).json({ created: true, notificationId: inserted[0].id });
  } catch (e) {
    next(e);
  }
});
