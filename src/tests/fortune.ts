import 'dotenv/config';
import { generateFortuneResult } from "../gemini/generateFortuneResult";
import { UserInfoGemini } from "../types";

const userinfo: UserInfoGemini = {
  follower: {
    did: "did:plc:sample",
    handle: "suibari.com",
    displayName: "すいばり"
  },
  langStr: "日本語",
}

await generateFortuneResult(userinfo);

(async () => {
  const text = await generateFortuneResult(userinfo);
  console.log(`bot>>> ${text}`);
})();
