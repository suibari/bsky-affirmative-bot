import { QueryParams } from '@atproto/api/dist/client/types/app/bsky/graph/getFollowers';
import { ProfileView } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { agent } from './agent.js';

/**
 * 指定されたユーザーの全てのフォロワーを取得する
 * @param {QueryParams} params - フォロワーを取得するユーザーのパラメータ
 * @param {number} threshold_follower - フォロワーしきい値
 * @returns {Promise<Array>} - フォロワーの配列
 */
export async function getConcatFollowers(params: QueryParams, threshold_follower: number): Promise<Array<ProfileView>> {
  let followers: ProfileView[] = [];

  try {
    let response = await agent.getFollowers(params);
    followers = response.data.followers;

    while (('cursor' in response.data) && (threshold_follower > followers.length)) {
      const paramswithcursor = Object.assign(params, {
        cursor: response.data.cursor
      });

      response = await agent.getFollowers(paramswithcursor);
      followers = followers.concat(response.data.followers);
    };
    return followers;
  } catch (e) {
    throw e;
  }
}
