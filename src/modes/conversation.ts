import { AppBskyEmbedImages } from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { CommitCreateEvent } from "@skyware/jetstream";
import { agent } from "../bsky/agent.js";
import { getImageUrl, getLangStr, splitUri, uniteDidNsidRkey } from "../bsky/util.js";
import { conversation } from "../gemini/conversation.js";
import { handleMode } from "./index.js";
import { CONVMODE_TRIGGER } from '../config/index.js';
import { GeminiResponseResult, UserInfoGemini } from "../types.js";
import { db } from "../db/index.js";
import { Content } from "@google/genai";

const MINUTES_THRD_RESPONSE = 10 * 60 * 1000; // 10min
const MAX_BOT_MEMORY = 100;

const flagsWaiting = new Map();

export async function handleConversation (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
  const did = event.did;
  const record = event.commit.record as Record;

  // 同じユーザが処理中か確認、処理中なら無視
  if (flagsWaiting.get(did)) {
    return false;
  }

  // 添付画像取得
  let image_url: string | undefined = undefined;
  let mimeType: string | undefined = undefined;
  if (record.embed && record.embed.$type === "app.bsky.embed.images") {
    ({image_url, mimeType} = getImageUrl(follower.did, record.embed as AppBskyEmbedImages.Main));
  }

  return await handleMode(event, {
    triggers: CONVMODE_TRIGGER,
    dbColumn: "last_conv_at",
    dbValue: new Date().toISOString(),
    generateText: waitAndGenReply,
    checkConditionsAND: await isTalking(did, record), // 会話スレッドの判定
  },
  {
    follower,
    langStr: getLangStr(record.langs),
    image_url: image_url,
    image_mimeType: mimeType,
  });
}

async function isTalking (did: string, record: Record) {
  // 会話継続判定: eventにはuriは直接含まれずめんどくさいのでcidで比較する
  const rootCidDb = String(await db.selectDb(did, "conv_root_cid"));
  let rootCid =  record.reply?.root.cid;
  const parentUri = record.reply?.parent.uri;
  const {did: parantDid} = parentUri ? splitUri(parentUri) : {did: undefined};
  const isValidRootCid = (rootCidDb === rootCid); // DBに存在=会話済み
  const isValidParent = (process.env.BSKY_DID === parantDid); // ポストの親ポストがbotのポスト

  return isValidRootCid && isValidParent;
}

async function waitAndGenReply (userinfo: UserInfoGemini, event: CommitCreateEvent<"app.bsky.feed.post">): Promise<GeminiResponseResult> {
  const record = event.commit.record as Record;

  flagsWaiting.set(userinfo.follower.did, true);

  // 前回までの会話取得
  const history = await db.selectDb(userinfo.follower.did, "conv_history") as Content[];
  if (history) {
    // 先頭要素がmodelの発話だとエラーになるので回避する
    if (history[0].role === "model") {
      history.shift();
    };
    userinfo.history = history;
  }

  // 応答生成
  const {text_bot, new_history} = await conversation(userinfo);
  if (!text_bot) throw new Error("Failed to generate response text.");

  // イイネ応答
  const uri = uniteDidNsidRkey(event.did, event.commit.collection, event.commit.rkey);
  await agent.like(uri, event.commit.cid);

  // MINUTES_THRD_RESPONSE 分待つ
  if (process.env.NODE_ENV === "production") {
    console.log(`[INFO][${userinfo.follower.did}] Waiting conversation...`);
    await new Promise(resolve => setTimeout(resolve, MINUTES_THRD_RESPONSE));
  }

  // historyのクリップ処理
  while (new_history.length > MAX_BOT_MEMORY) {
    new_history.shift(); // 先頭から削除
  }

  // 初回の呼びかけまたは呼びかけし直しならreplyがないのでそのポストのcidを取得
  const rootCid = record.reply?.root.cid || String(event.commit.cid);

  // DB登録
  db.updateDb(userinfo.follower.did, "conv_history", JSON.stringify(new_history));
  db.updateDb(userinfo.follower.did, "conv_root_cid", rootCid);
  console.log(`[INFO][${userinfo.follower.did}] send coversation-result`);

  return text_bot;
}
