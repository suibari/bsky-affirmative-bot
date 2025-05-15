import { PROMPT_AFFIRMATIVE_WORD } from "../config/index.js";
import { UserInfoGemini } from "../types.js";
import { generateSingleResponseWithScore, getWhatDay } from "./util.js";

export async function generateAffirmativeWord(userinfo: UserInfoGemini) {
  const prompt = PROMPT_AFFIRMATIVE_WORD(userinfo);
  const result = await generateSingleResponseWithScore(prompt, userinfo);

  if (process.env.NODE_ENV === "development") {
    console.log(`[DEBUG][${userinfo.follower.did}] Score: ${result.score}`);
  }
  
  return result;
}
