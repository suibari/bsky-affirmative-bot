import 'dotenv/config';

import { UserInfoGemini } from "../types";
import { generateAnniversary } from '../gemini/generateAnniversary';

(async () => {
  const userinfoBase: UserInfoGemini = {
    follower: {
      did: "did:plc:sample",
      handle: "suibari.com",
      displayName: "すいばり"
    },
    langStr: "日本語",
    posts: ["ハッピーバースデーとぅーみー", "たのしいな"]
  };

  // Test 1: Just Birthday
  const userinfoBirthday: UserInfoGemini = {
    ...userinfoBase,
    anniversary: [
      {
        id: "birthday",
        names: { ja: "誕生日", en: "Birthday" },
        rule: { type: "fixed", month: 2, day: 7 },
      }
    ]
  };
  console.log("--- Test 1: Birthday Only ---");
  console.log(await generateAnniversary(userinfoBirthday));

  // Test 2: Christmas
  const userinfoChristmas: UserInfoGemini = {
    ...userinfoBase,
    anniversary: [
      {
        id: "christmas",
        names: { ja: "クリスマス", en: "Christmas" },
        rule: { type: "fixed", month: 12, day: 25 },
      }
    ]
  };
  console.log("\n--- Test 2: Christmas ---");
  console.log(await generateAnniversary(userinfoChristmas));
})();
