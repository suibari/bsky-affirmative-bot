import 'dotenv/config';
import { UserInfoGemini } from "../types";
import { generateRecommendedSong } from '../gemini/generateRecommendedSong';
import { searchSpotifyUrlAndAddPlaylist } from '../spotify';

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
  
  const result = await searchSpotifyUrlAndAddPlaylist(`"${resultGemini.title}" "${resultGemini.artist}"`);
  console.log("bot>>> ", result);
} catch (err) {
  console.error("エラー:", err);
}
