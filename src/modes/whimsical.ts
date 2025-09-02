import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { agent } from "../bsky/agent";
import { postContinuous } from "../bsky/postContinuous";
import { dbPosts } from "../db";
import { WhimsicalPostGenerator } from "../gemini/generateWhimsicalPost";
import { botBiothythmManager } from "..";

const whimsicalPostGen = new WhimsicalPostGenerator();

// 投稿言語を管理する変数
let isJapanesePost = true;

export async function doWhimsicalPost () {
  // スコアTOPのfollowerを取得
  const row = await dbPosts.getHighestScore();

  let did: string;
  let post: string | undefined;
  let topFollower: ProfileView | undefined;
  try {
    if (row) {
      did = row.did;
      post = row.post;
      topFollower = (await agent.getProfile({actor: did})).data as ProfileView;
    }
  } catch(e) {
    // TOPが無効アカウントなどの理由で取得できない場合
    console.error(`[INFO] whimsical post error: ${e}`);
  }
  
  const langStr = isJapanesePost ? "日本語" : "English";

  // ポスト
  const text_bot = await whimsicalPostGen.generate({
    topFollower: topFollower ?? undefined,
    topPost: post,
    langStr: langStr,
    currentMood: botBiothythmManager.getMood,
  });
  await postContinuous(text_bot);

  // 言語を切り替え
  isJapanesePost = !isJapanesePost;

  // テーブルクリア
  dbPosts.clearAllRows();
}
