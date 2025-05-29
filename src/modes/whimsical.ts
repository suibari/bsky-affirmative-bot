import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { botBiothythmManager } from "../biorhythm";
import { agent } from "../bsky/agent";
import { postContinuous } from "../bsky/postContinuous";
import { dbPosts } from "../db";
import { WhimsicalPostGenerator } from "../gemini/generateWhimsicalPost";

const whimsicalPostGen = new WhimsicalPostGenerator();
const whimsicalPostGenEn = new WhimsicalPostGenerator();

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
  
  // ポスト
  const text_bot = await whimsicalPostGen.generate({
    topFollower: topFollower ?? undefined,
    topPost: post,
    langStr: "日本語",
    currentMood: botBiothythmManager.getMood,
  });
  await postContinuous(text_bot);
  const text_bot_en = await whimsicalPostGenEn.generate({
    topFollower: topFollower ?? undefined,
    topPost: post,
    langStr: "英語",
    currentMood: botBiothythmManager.getMood,
  });
  await postContinuous(text_bot_en);

  // テーブルクリア
  dbPosts.clearAllRows();
}