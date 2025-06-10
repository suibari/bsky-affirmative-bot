import { QueryParams } from '@atproto/api/dist/client/types/app/bsky/actor/getProfiles.js';
import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { agent } from './agent.js';

/**
 * getProfilesに25件ずつ分割してバッチ取得する
 * @param {string[]} actors - プロフィールを取得したいdid一覧
 * @returns {Promise<ProfileView[]>} - 取得されたプロフィール配列
 */
export async function getConcatProfiles(params: QueryParams): Promise<Array<ProfileViewDetailed>> {
  const batchSize = 25;
  const allProfiles: ProfileViewDetailed[] = [];

  for (let i = 0; i < params.actors.length; i += batchSize) {
    const batch = params.actors.slice(i, i + batchSize);

    try {
      const res = await agent.app.bsky.actor.getProfiles({
        actors: batch
      });
      allProfiles.push(...res.data.profiles);
    } catch (e) {
      console.error(`Error fetching profiles for batch ${i / batchSize + 1}`, e);
      // 必要なら continue; でスキップ可能
      throw e;
    }
  }

  return allProfiles;
}