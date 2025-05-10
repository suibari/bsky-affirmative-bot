import { UserInfoGemini } from "../types.js";
import { generateSingleResponse } from "./util.js";

export async function generateAffirmativeWord(userinfo: UserInfoGemini) {
  const part_prompt_main = userinfo.image_url ? `ユーザの画像の内容について、200文字までで褒めてください。画像の内容について具体的に言及して褒めるようにしてください。` :
                                                `ユーザからの文章に対して具体的に、100文字までで褒めてください。`;
  const part_prompt_lang = userinfo.langStr ? `出力する文章はすべて${userinfo.langStr}としてください。` :
                                              `褒める際の言語は、ユーザの文章の言語に合わせてください。`;
  const prompt = 
`
${part_prompt_main}
${part_prompt_lang}
-----この下がユーザからのメッセージです-----
ユーザ名: ${userinfo.follower.displayName}
文章: ${userinfo.posts?.[0] || ""}`;

  const response = await generateSingleResponse(prompt, userinfo);
  
  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  const result = response.text?.split("-----")[0];

  return result ?? "";
}
