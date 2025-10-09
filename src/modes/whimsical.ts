import { postContinuous } from "../bsky/postContinuous";
import { WhimsicalPostGenerator } from "../gemini/generateWhimsicalPost";
import { botBiothythmManager } from "..";
import { dbPosts } from "../db";
import { AtpAgent } from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { agent } from "../bsky/agent";
import { getPds } from "../bsky/getPds";
import { post } from "../bsky/post";
import { repost } from "../bsky/repost";
import { splitUri } from "../bsky/util";
import { generateGoodNight } from "../gemini/generateGoodNight";
import { generateMyMoodSong } from "../gemini/generateMyMoodSong";
import { searchSpotifyUrlAndAddPlaylist } from "../spotify";

const whimsicalPostGen = new WhimsicalPostGenerator();

// 投稿言語を管理する変数
let isJapanesePost = true;

export async function doWhimsicalPost () {
  const langStr = isJapanesePost ? "日本語" : "English";

  // ポスト
  const currentMood = botBiothythmManager.getMood;
  let text_bot = await whimsicalPostGen.generate({
    langStr: langStr,
    currentMood,
  });

  // ムードソング
  const result = await generateMyMoodSong(currentMood, langStr);
  const resultSpotify = await searchSpotifyUrlAndAddPlaylist({artist: result.artist, track: result.title});
  const songInfo = `\n\nMyMoodSong:\n${result.title} - ${result.artist}\n${resultSpotify}`;
  text_bot += songInfo;

  await postContinuous(text_bot);

  // 言語を切り替え
  isJapanesePost = !isJapanesePost;
}

export async function doGoodNightPost (mood: string) {
  // スコアTOPのfollowerを取得
  const row = await dbPosts.getHighestScore();

  try {
    if (row) {
      // DBパース
      const uri: string = row.uri;
      const {did, nsid, rkey} = splitUri(uri);
      const topPost: string = row.post;
      const topFollower = (await agent.getProfile({actor: did})).data as ProfileView;

      // cid取得: NOTE, 格納時に取得した方がいいのかな？
      const agentPDS = new AtpAgent({service: await getPds(did!)});
      const response = await agentPDS.com.atproto.repo.getRecord({
        repo: did,
        collection: nsid,
        rkey,
      });
      const cid = response.data.cid;

      // topPostがなければお休みあいさつしない
      if (topPost && cid) {
        // リポスト
        await repost(uri, cid);

        // Gemini生成
        const text_bot = await generateGoodNight({
          topFollower: topFollower ?? undefined,
          topPost,
          currentMood: mood,
        });

        // ポスト
        await postContinuous(text_bot);

        // 1日のテーブルクリア
        dbPosts.clearAllRows();
      } 
    }
  } catch(e) {
    console.error(`[INFO] good night post error: ${e}`);
  }
}
