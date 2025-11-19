import { CommitCreateEvent } from "@skyware/jetstream";
import { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { getImageUrl, isReplyOrMentionToMe, uniteDidNsidRkey } from "../bsky/util.js";
import { postContinuous } from "../bsky/postContinuous.js";
import { SQLite3 } from "../db/index.js";
import { GeminiResponseResult, ImageRef, UserInfoGemini } from "../types.js";
import { NICKNAMES_BOT } from "../config/index.js";
import { AppBskyEmbedImages } from "@atproto/api";

type TriggeredReplyHandlerOptions = {
  triggers: string[]; // 発火ワード一覧
  db: SQLite3; // 更新対象DB
  dbColumn?: string;   // 更新するDBのカラム名（例: "is_u18"）
  dbValue?: number | string; // 登録時にセットする値（例: 1）
  generateText: GeminiResponseResult | ((userinfo: UserInfoGemini, event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) => Promise<GeminiResponseResult | undefined>); // 返信するテキスト(コールバック対応)
  checkConditionsOR?: boolean; // 呼びかけ OR追加条件 (呼びかけ&&トリガーワード、または本条件を満たすと関数実行)
  checkConditionsAND?: boolean; // 呼びかけ AND追加条件（呼びかけ&&トリガーワード、かつ本条件を満たしてはじめて関数実行）
  disableDefaultCondition?: boolean; // 呼びかけの無効化。トリガーワードは常に有効
  disableReply?: boolean; // リプライの無効化
};

export const handleMode = async (
  event: CommitCreateEvent<"app.bsky.feed.post">,
  options: TriggeredReplyHandlerOptions,
  userinfo?: UserInfoGemini
): Promise<boolean> => {
  const did = String(event.did);
  const cid = String(event.commit.cid);
  const uri = uniteDidNsidRkey(did, event.commit.collection, event.commit.rkey);
  const record = event.commit.record as Record;
  const text = record.text.toLowerCase();

  if (!options.checkConditionsOR) {
    // botへの呼びかけ判定
    const notCalled = !isReplyOrMentionToMe(record) && !NICKNAMES_BOT.some(elem => text.includes(elem));
    if (notCalled && !options.disableDefaultCondition) return false;

    // トリガーワード判定
    const matchedTrigger = options.triggers.some(trigger => text.includes(trigger));
    if (!matchedTrigger) return false;
  }  

  // 追加条件判定
  if (process.env.NODE_ENV !== "development" && (options.checkConditionsAND !== undefined && !options.checkConditionsAND)) {
    return false;
  }

  // -----ここからmain処理-----
  // 非フォロワーはここで登録する(フォロワーならIGNOREされるはず)
  options.db.insertDb(did);

  // 画像読み出し
  const image = getImageUrl(did, record.embed);
  if (userinfo) {
    userinfo.image = image; // userinfoに画像情報をセット
  }

  // ポスト&DB更新
  let result: GeminiResponseResult | undefined;
  if (typeof options.generateText === "function") {
    if (!userinfo) throw new Error("userinfo is required for responseText function.");
    result = await options.generateText(userinfo, event, options.db);
  } else {
    result = options.generateText;
  }

  if (result !== undefined) { // generateTextがundefinedを返すのはSPAM判定時のみ
    if (typeof result === "string") {
      if (options.disableReply) {
        await postContinuous(result);
      } else {
        await postContinuous(result, {uri, cid, record});
      }
    } else if (result.imageBlob) {
      // generateTextで画像を作ったときは、画像付きリプライ
      await postContinuous(result.text, {uri, cid, record}, {blob: result.imageBlob, alt: `Dear ${userinfo?.follower.displayName}, From 全肯定botたん`});
    } else if (result.embedTo) {
      // generateTextで引用ポストを拾ったときは、引用付きリプライ
      await postContinuous(result.text, {uri, cid, record}, undefined, result.embedTo);
    } else {
      await postContinuous(result.text, {uri, cid, record});
    }
  }

  // DB更新: 列、値が指定ある時だけ
  if (options.dbColumn && (options.dbValue !== undefined && options.dbValue !== null)) {
    options.db.updateDb(did, options.dbColumn, options.dbValue);
    console.log(`[INFO][${did}] exec mode: ${options.dbColumn}`);
  }

  return true;
};

export async function isPast(event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3, db_colname: string, mins_thrd: number) {
  const did = String(event.did);
  const msec_thrd = mins_thrd * 60 * 1000;
  const postedAt = new Date((event.commit.record as Record).createdAt);
  const lastAt = new Date(await db.selectDb(did, db_colname) || 0);

  return (postedAt.getTime() - lastAt.getTime() > msec_thrd);
}
