import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { agent } from "./agent.js"
import { ThreadInfo } from "../types.js";

/**
 * Blueskyのポストレコードから親・親の親・ルートをフェッチして返す
 * @param agent BskyAgent (認証済み)
 * @param record 元ポストのRecord
 */
export async function parseThread(
  record: Record
): Promise<ThreadInfo> {
  if (!record.reply) {
    return {} // 返信でない場合は空
  }

  let parent: Record | undefined
  let grandParent: Record | undefined
  let root: Record | undefined

  // 親ポストを取得
  if (record.reply.parent?.uri) {
    const parentRes = await agent.getPost({
      repo: record.reply.parent.uri.split('/')[2],
      rkey: record.reply.parent.uri.split('/')[4],
    });
    parent = parentRes?.value as Record
  }

  // 親の親（grandParent）を取得
  if (parent?.reply?.parent?.uri) {
    const gpRes = await agent.getPost({
      repo: parent.reply.parent.uri.split('/')[2],
      rkey: parent.reply.parent.uri.split('/')[4],
    });
    grandParent = gpRes?.value as Record
  }

  // ルートを取得
  if (record.reply.root?.uri) {
    const rootRes = await agent.getPost({
      repo: record.reply.root.uri.split('/')[2],
      rkey: record.reply.root.uri.split('/')[4],
    });
    root = rootRes?.value as Record
  } else {
    root = parent ?? record
  }

  return { parent, grandParent, root }
}