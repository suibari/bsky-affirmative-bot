import retry from 'async-retry';
import { AppBskyEmbedImages } from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs"; // Changed to default import
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { CommitCreateEvent } from "@skyware/jetstream"; // Changed back to named import
import { agent } from "../bsky/agent.js";
import { getImageUrl, getLangStr, isReplyOrMentionToMe, splitUri, uniteDidNsidRkey } from "../bsky/util.js";
import { conversation } from "../gemini/conversation.js";
import { handleMode } from "./index.js";
import { GeminiResponseResult, ImageRef, UserInfoGemini } from "../types.js";
import { SQLite3 } from "../db/index.js";
import { Content } from "@google/genai";
import { parseThread, ParsedThreadResult } from "../bsky/parseThread.js";
import { logger } from "../index.js"; // Assuming logger is still needed for other purposes

const MAX_BOT_MEMORY = 100;

export async function handleConversation (event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
  const did = event.did;
  const record = event.commit.record as Record;

  // 添付画像取得
  let image: ImageRef[] | undefined = undefined;
  if (record.embed) {
    (image = getImageUrl(follower.did, record.embed as AppBskyEmbedImages.Main));
  }

  // 前回までの会話取得
  let history = (await db.selectDb(follower.did, "conv_history")) as Content[] | undefined;
  if (!history) history = [];  // undefinedなら空配列で初期化
  const conv_root_cid = await db.selectDb(follower.did, "conv_root_cid") as String;

  // スレッドrootがポストしたユーザでないなら早期リターン
  if (!record.reply?.root.uri.includes(follower.did)) return false;

  // ユーザからbotへのリプライ時、botの定期ポストでなければ、
  // 1ユーザの元ポスト、2botのリプライ、3ユーザのさらなるリプライ となっているはず
  // conv_root_cidがスレッドのrootと等しくないなら、historyに会話履歴を追加する必要あり
  try {
    if (conv_root_cid !== record.reply?.root.cid) {
      const thread: ParsedThreadResult = await parseThread(record);
      // 親の親ポスト
      const gpContent: Content = {
        role: "user",
        parts: [
          {
            text: thread.userPostText
          },
        ],
      }
      history.push(gpContent)
      // 親ポスト
      const parentContent: Content = {
        role: "model",
        parts: [
          {
            text: thread.botPostText
          }
        ]
      }
      history.push(parentContent);
    }
  } catch (error) {
    console.error(`[ERROR][${did}] Failed to parse thread:`, error);
    return false; // スレッド解析に失敗した場合は処理を中止
  }

  return await handleMode(event, {
    triggers: [], // トリガーワードなし、botへのリプライであれば常に反応
    db,
    dbColumn: "last_conv_at",
    dbValue: new Date().toISOString(),
    generateText: waitAndGenReply,
    checkConditionsOR: isReplyOrMentionToMe(record),
  },
  {
    follower,
    posts: [record.text],
    langStr: getLangStr(record.langs),
    image,
    history,
  });
}

async function waitAndGenReply (userinfo: UserInfoGemini, event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3): Promise<GeminiResponseResult> {
  const record = event.commit.record as Record;  

  let text_bot: string | undefined = undefined;
  let new_history: Content[] = [];

  try {
    await retry(async (bail, attempt) => {
      const result = await conversation(userinfo);
      text_bot = result.text_bot;
      new_history = result.new_history;

      if (!text_bot) {
        console.warn(`[WARN][${userinfo.follower.did}] Attempt ${attempt}: Failed to generate response text. Retrying...`);
        throw new Error("Response text is empty, retrying."); // Throw to trigger retry
      }
    }, {
      retries: 3, // Number of retries
      onRetry: (error: any, attempt) => {
        console.warn(`[WARN][${userinfo.follower.did}] Retry attempt ${attempt} failed: ${error.message}`);
      }
    });
  } catch (error: any) {
    console.error(`[ERROR][${userinfo.follower.did}] Failed to generate response text after multiple retries: ${error.message}`);
    return "";
  }

  const final_text_bot = text_bot || "";

  // イイネ応答
  const uri = uniteDidNsidRkey(event.did, event.commit.collection, event.commit.rkey);
  await agent.like(uri, event.commit.cid);
  logger.addBskyRate(); // RateLimit加算

  // historyのクリップ処理
  while (new_history.length > MAX_BOT_MEMORY) {
    new_history.shift(); // 先頭から削除
    if (new_history[0].role === "model") {
      new_history.shift();
    }
  }

  // 初回の呼びかけまたは呼びかけし直しならreplyがないのでそのポストのcidを取得
  const rootCid = record.reply?.root.cid || String(event.commit.cid);

  // 会話記録にinlineDataが含まれると巨大すぎるので削除しておく
  for (const content of new_history) {
    if (content.parts) {
      content.parts = content.parts.filter(
        (part: any) => !("inlineData" in part)
      );
    }
  }

  // DB登録
  db.updateDb(userinfo.follower.did, "conv_history", JSON.stringify(new_history));
  db.updateDb(userinfo.follower.did, "conv_root_cid", rootCid);
  console.log(`[INFO][${userinfo.follower.did}] send coversation-result`);

  return final_text_bot;
}
