import 'dotenv/config';
import { generateFortuneResult } from "../gemini/generateFortuneResult";
import { UserInfoGemini } from "../types";
import { generateAnniversary } from '../gemini/generateAnniversary';

(async () => {
  const userinfo: UserInfoGemini = {
    follower: {
      did: "did:plc:sample",
      handle: "suibari.com",
      displayName: "すいばり"
    },
    langStr: "日本語",
    anniversary: [
      {
        id : "",
        names: {
          ja: "誕生日",
          en: "誕生日"
        },
        rule: {
          type: "fixed",
          month: 2,
          day: 7,
        },
      },
      {
        id : "",
        names: {
          ja: "節分",
          en: "節分"
        },
        rule: {
          type: "fixed",
          month: 2,
          day: 3,
        },
      }
    ],
    posts: ["ハッピーバースデーとぅーみー"]
  }

  const text = await generateAnniversary(userinfo);
  console.log(`bot>>> ${text}`);
})();
