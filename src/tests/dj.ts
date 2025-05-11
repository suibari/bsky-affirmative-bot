import 'dotenv/config';
import { UserInfoGemini } from "../types";
import { generateRecommendedSong } from '../gemini/generateRecommendedSong';
import { searchYoutubeLink } from '../youtube';

const userinfo: UserInfoGemini = {
  follower: {
    did: "did:plc:sample",
    handle: "suibari.com",
    displayName: "すいばり"
  },
  langStr: "日本語",
  posts: [process.argv[2]]
};

try {
  const resultGemini = await generateRecommendedSong(userinfo);
  console.log("bot>>> ", resultGemini);
  
  const resultYoutube = await searchYoutubeLink(`"${resultGemini.title}" "${resultGemini.artist}"`);
  console.log("bot>>> ", resultYoutube);
} catch (err) {
  console.error("エラー:", err);
}
