import { QueryParams } from '@atproto/api/dist/client/types/app/bsky/graph/getFollowers';
import { ProfileView } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { agent } from './agent.js';
import retry from 'async-retry';

/**
 * 指定されたユーザーの全てのフォロワーを取得する (ページ取得ごとにリトライ処理を実装)
 * @param {QueryParams} params - フォロワーを取得するユーザーのパラメータ
 * @param {number} threshold_follower - フォロワーしきい値
 * @returns {Promise<Array>} - フォロワーの配列
 */
export async function getConcatFollowers(params: QueryParams, threshold_follower?: number): Promise<Array<ProfileView>> {
  let followers: ProfileView[] = [];
  let cursor: string | undefined;

  const fetchPageWithRetry = async (pageParams: QueryParams) => {
    return await retry(
      async () => {
        return await agent.getFollowers(pageParams);
      },
      {
        retries: 3, // 3回までリトライ
        factor: 2,
        minTimeout: 1000, // 1秒
        onRetry: (err, attempt) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[WARN] getFollowers API call failed (cursor: ${pageParams.cursor}). Retrying attempt ${attempt}...:`, message);
        }
      }
    );
  };

  try {
    // 最初のページを取得
    let response = await fetchPageWithRetry(params);
    followers = followers.concat(response.data.followers);
    cursor = response.data.cursor;

    // カーソルがある限り次のページを取得
    while (cursor && (threshold_follower ?? Infinity > followers.length)) {
      response = await fetchPageWithRetry({ ...params, cursor });
      followers = followers.concat(response.data.followers);
      cursor = response.data.cursor;
    }
    return followers;
  } catch (e) {
    console.error("[ERROR] Failed to fetch a page of followers after multiple retries.", e);
    throw e; // 呼び出し元でエラーを処理できるように再スロー
  }
}
