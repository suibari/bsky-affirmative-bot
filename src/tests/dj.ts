import 'dotenv/config';
import { UserInfoGemini } from "../types";
import readline from "readline";
import { generateRecommendedSong } from '../gemini/generateRecommendedSong';

// ユーザー入力を受け取る準備
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("曲の雰囲気や気分を入力してください: ", async (mood) => {
  const userinfo: UserInfoGemini = {
    follower: {
      did: "did:plc:sample",
      handle: "suibari.com",
      displayName: "すいばり"
    },
    langStr: "日本語",
    posts: [mood]
  };

  try {
    const result = await generateRecommendedSong(userinfo);
    console.log("bot>>> ", result);
  } catch (err) {
    console.error("エラー:", err);
  } finally {
    rl.close();
  }
});
