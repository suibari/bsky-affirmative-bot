import 'dotenv/config';
import { UserInfoGemini } from "../types";
import { generateOmikuji } from '../gemini/generateOmikuji';

const userinfo: UserInfoGemini = {
  follower: {
    did: "did:plc:sample",
    handle: "suibari.com",
    displayName: "すいばり"
  },
  langStr: "日本語",
};

(async () => {
  const text = await generateOmikuji(userinfo);
  console.log(`bot>>> ${text}`);
})();
