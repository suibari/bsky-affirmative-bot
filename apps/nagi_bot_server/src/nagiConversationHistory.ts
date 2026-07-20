import { db, nagiPosts, MemoryService } from "@bsky-affirmative-bot/database";
import { and, eq, isNull } from "drizzle-orm";

// @google/genai の Content 互換の最小型。この app に SDK を直接依存させないための定義。
export type ConversationTurn = {
  role?: string;
  parts?: { text?: string }[];
};

// 祖先チェーンを遡る上限。会話が異常に長い場合の暴走防止。
const MAX_ANCESTORS = 50;

type Ancestor = { uri: string; did: string; text: string };

/**
 * 返信先ポストから root 方向へ replyParentUri を遡り、古い順の祖先チェーンを返す。
 * Nagi は bot 自身の投稿も nagi.posts にインデックスしているので、
 * Bluesky 版の parseThread と違いネットワークアクセスなしでスレッドを復元できる。
 */
async function fetchAncestorChain(parentUri: string): Promise<Ancestor[]> {
  const chain: Ancestor[] = [];
  const seen = new Set<string>();
  let uri: string | null = parentUri;

  while (uri && !seen.has(uri) && chain.length < MAX_ANCESTORS) {
    seen.add(uri);
    const rows = await db
      .select({
        uri: nagiPosts.uri,
        did: nagiPosts.did,
        text: nagiPosts.text,
        replyParentUri: nagiPosts.replyParentUri,
      })
      .from(nagiPosts)
      .where(and(eq(nagiPosts.uri, uri), isNull(nagiPosts.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) break;

    chain.push({ uri: row.uri, did: row.did, text: row.text });
    uri = row.replyParentUri;
  }

  return chain.reverse();
}

const turnText = (turn: ConversationTurn) =>
  turn.parts?.map((part: any) => part.text ?? "").join("") ?? "";

/**
 * 履歴のどこかに同一本文の model ターンがあるか。
 * 末尾だけを見ないのは、Bluesky やお部屋の会話が間に挟まると
 * 末尾が別サーフェスの発話になり、同じスレッドを二重に継ぎ足してしまうため。
 */
function hasModelTurn(history: ConversationTurn[], text: string) {
  return history.some((turn) => turn.role === "model" && turnText(turn) === text);
}

/**
 * conv_history（Bluesky・Nagi・お部屋をまたぐ共有記憶）に、
 * 必要なら今回のスレッドの流れを継ぎ足した会話履歴を組み立てる。
 */
export async function buildNagiConversationHistory(job: any): Promise<ConversationTurn[]> {
  const record: any = job.recordJson;
  const botDid = process.env.NAGI_BOT_DID!;

  const follower = await MemoryService.getFollower(job.authorDid);
  let history: ConversationTurn[] = [];
  if (follower?.conv_history) {
    history =
      typeof follower.conv_history === "string"
        ? JSON.parse(follower.conv_history)
        : follower.conv_history;
  }

  const parentUri = record.reply?.parent?.uri;
  if (typeof parentUri !== "string") return history;

  const chain = await fetchAncestorChain(parentUri);
  if (!chain.length) return history;

  // 直前の bot ポスト本文が既に履歴にあれば、このスレッドは記録済みなので継ぎ足さない。
  // Bluesky 側の conv_root_cid（継ぎ足し済みフラグ）に相当する判定を、
  // nagi.posts からスレッドを復元できる利点を使ってカラム無しで行う。
  const parentText = chain[chain.length - 1]?.text ?? "";
  if (parentText && hasModelTurn(history, parentText)) {
    return history;
  }

  for (const post of chain) {
    if (!post.text) continue;
    history.push({
      role: post.did === botDid ? "model" : "user",
      parts: [{ text: post.text }],
    });
  }

  return history;
}
