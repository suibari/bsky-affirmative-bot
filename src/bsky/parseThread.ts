import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { agent } from "./agent.js"; // agentをインポートし、設定を仮定
import { splitUri } from "./util.js";

// 新しい戻り値の型を定義
export interface ParsedThreadResult {
  botPostText: string;
  userPostText: string;
}

/**
 * Blueskyのポストレコードから親・親の親・ルートをフェッチして返す
 * 親をたどっていき、最初のユーザポストをuserPostTextと定義
 * その手前から直接の親までのポストのテキストを連結したものをbotPostTextとする
 * @param record 元ポストのRecord
 */
export async function parseThread(
  record: Record
): Promise<ParsedThreadResult> {
  if (!record.reply) {
    return { botPostText: "", userPostText: "" }; // 返信でない場合は空の文字列を返す
  }

  // agent.getPostが{ uri, value: Record }を返すことを前提とした型定義
  interface FetchedPostInfo {
    record: Record | undefined;
    uri: string | undefined;
  }

  let directParentInfo: FetchedPostInfo | undefined;
  let grandParentInfo: FetchedPostInfo | undefined; // grandParentのレコードとそのuriを格納
  let botPostText = "";
  let userPostText = ""; // grandParentの投稿のテキストを格納

  // URIで投稿を取得し、RecordとURIを返すヘルパー関数
  const fetchRecordAndUriByUri = async (uri: string | undefined): Promise<FetchedPostInfo | undefined> => {
    if (!uri) return undefined;
    try {
      const {did, nsid, rkey} = splitUri(uri);
      const response = await agent.getPost({ repo: did, rkey: rkey });
      return { record: response?.value as Record, uri: response?.uri };
    } catch (error) {
      console.error(`URI ${uri}の投稿の取得に失敗しました:`, error);
      return undefined;
    }
  };

  // 直接の親のRecordとURIを取得
  directParentInfo = await fetchRecordAndUriByUri(record.reply.parent?.uri);
  // console.log(`[DEBUG] directParentInfo: ${directParentInfo}`);

  // grandParent（最初のユーザ投稿）を見つけ、親のテキストを収集
  let currentParentInfo: FetchedPostInfo | undefined = directParentInfo;
  let collectedParentTexts: string[] = [];

  // 環境変数からボットのDIDを取得
  const botDid = process.env.BSKY_DID; // 環境変数へのアクセス

  while (currentParentInfo?.record) {
    // console.log(`[DEBUG] currentParentInfo.uri: ${currentParentInfo?.uri}`);
    // 現在の投稿がボットのものではないかを確認
    // ボットの識別: URIにボットのDIDが含まれているかを確認
    const isBotPost = currentParentInfo.uri?.includes(botDid ?? ''); // botDidがundefinedの場合の安全対策として?? ''を使用

    if (!isBotPost) {
      // grandParent（最初のユーザ投稿）を発見
      grandParentInfo = currentParentInfo;
      break; // grandParentの検索を停止
    }

    // ボットの投稿の場合、そのテキストを収集に追加し、次の親へ移動
    if (currentParentInfo.record.text) {
      collectedParentTexts.unshift(currentParentInfo.record.text); // Use unshift to add to the beginning // ボットの投稿の場合、テキストをコレクションの先頭に追加し、次の親へ移動
    }

    // 次の親へ移動
    currentParentInfo = await fetchRecordAndUriByUri(currentParentInfo.record.reply?.parent?.uri);
  }

  // 親のテキストを正しい順序で連結
  botPostText = collectedParentTexts.join(); // No need to reverse anymore // 親のテキストを正しい順序で連結

  // grandParentの投稿のテキストを取得
  userPostText = grandParentInfo?.record?.text ?? ""; // テキストを取得、見つからない場合は空文字列をデフォルトとする
  // console.log(`[DEBUG] userPostText: ${grandParentText}, botPostText: ${parentText}`);

  return { botPostText, userPostText };
}
