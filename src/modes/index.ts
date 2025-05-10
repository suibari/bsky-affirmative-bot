import { CommitCreateEvent } from "@skyware/jetstream";
import { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { isReplyOrMentionToMe, uniteDidNsidRkey } from "../bsky/util.js";
import { postContinuous } from "../bsky/postContinuous.js";
import { db } from "../db/index.js";
import { GeminiResponseResult, UserInfoGemini } from "../types.js";
import { NICKNAMES_BOT } from "../config/index.js";

type TriggeredReplyHandlerOptions = {
  triggers: string[]; // 発火ワード一覧
  dbColumn: string;   // 更新するDBのカラム名（例: "is_u18"）
  dbValue: number | string; // 登録時にセットする値（例: 1）
  generateText: GeminiResponseResult | ((userinfo: UserInfoGemini, event: CommitCreateEvent<"app.bsky.feed.post">) => Promise<GeminiResponseResult>); // 返信するテキスト(コールバック対応)
  checkConditionsOR?: boolean; // 呼びかけ OR追加条件 (呼びかけまたは本条件を満たすと関数実行)
  checkConditionsAND?: boolean; // 呼びかけ AND追加条件（呼びかけ、かつ本条件を満たしてはじめて関数実行）
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
    if (!isReplyOrMentionToMe(record) && !NICKNAMES_BOT.some(elem => text.includes(elem))) return false;

    // トリガーワード判定
    const matchedTrigger = options.triggers.some(trigger => text.includes(trigger));
    if (!matchedTrigger) return false;
  }  

  // 追加条件判定
  if (process.env.NODE_ENV !== "development" && (options.checkConditionsAND !== undefined && !options.checkConditionsAND)) {
    return false;
  }

  // -----ここからmain処理-----
  // ポスト&DB更新
  let result: GeminiResponseResult;
  if (typeof options.generateText === "function") {
    if (!userinfo) throw new Error("userinfo is required for responseText function.");
    result = await options.generateText(userinfo, event);
  } else {
    result = options.generateText;
  }

  if (typeof result === "string") {
    await postContinuous(result, {uri, cid, record});
  } else if (result.imageBlob) {
    await postContinuous(result.text, {uri, cid, record}, {blob: result.imageBlob, alt: `Dear ${userinfo?.follower.displayName}, From 全肯定botたん`});
  };
  db.updateDb(did, options.dbColumn, options.dbValue);

  return true;
};

export async function isPast(event: CommitCreateEvent<"app.bsky.feed.post">, db_colname: string, hours_thrd: number) {
  const did = String(event.did);
  const msec_thrd = hours_thrd * 60 * 60 * 1000;
  const postedAt = new Date((event.commit.record as Record).createdAt);
  const lastAt = new Date(await db.selectDb(did, db_colname) || 0);
  console.log(postedAt, lastAt)

  return (postedAt.getTime() - lastAt.getTime() > msec_thrd);
}
