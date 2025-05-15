import { PROMPT_ANALYZE } from "../config/index.js";
import { UserInfoGemini } from "../types.js";
import { generateSingleResponse } from "./util.js";

export async function generateAnalyzeResult(userinfo: UserInfoGemini) {
  const prompt = PROMPT_ANALYZE(userinfo);
  const response = await generateSingleResponse(prompt, userinfo);

  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  const result = response.text?.split("-----")[0];

  return result ?? "";
}
