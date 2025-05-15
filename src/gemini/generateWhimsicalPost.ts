import { PROMPT_WHIMSICAL_POST } from "../config/index.js";
import { UserInfoGemini } from "../types.js";
import { generateSingleResponse, getFullDateAndTimeString, getRandomItems } from "./util.js";

export async function generateWhimsicalPost(userinfo: UserInfoGemini) {
  const prompt = PROMPT_WHIMSICAL_POST(userinfo);
  const response = await generateSingleResponse(prompt, userinfo);

  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  const result = response.text?.split("-----")[0];
  
  const mention = "@" + userinfo.follower.handle;

  return (result + " " + mention) || "";
}
