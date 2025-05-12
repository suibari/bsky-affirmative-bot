import { fetchJapaneseNews } from "../gnews/index.js";
import { UserInfoGemini } from "../types.js";
import { generateSingleResponseWithScore, getWhatDay } from "./util.js";

export async function generateAffirmativeWord(userinfo: UserInfoGemini) {
  const part_prompt_main = userinfo.image_url ? `ユーザの画像の内容について、200文字までで褒めてください。画像の内容について具体的に言及して褒めるようにしてください。` :
                                                `ユーザからの文章に対して具体的に、100文字までで褒めてください。`;
  const part_prompt_lang = userinfo.langStr ? `出力する文章はすべて${userinfo.langStr}としてください。` :
                                              `出力する文章はすべて英語としてください。`;
  const prompt = 
`
ユーザからの投稿について、commentとscoreにそれぞれ以下を出力してください。
* comment:
${part_prompt_main}
${part_prompt_lang}
絶対にscoreが分かる内容を入れないでください。
* score:
あなたの考えでユーザからの投稿について点数をつけてください。点数は0から100までです。
あなたが好きな話題や面白いと感じた話題は高得点、苦手な話題やつまらないと感じた話題は低い得点とします。
今日は以下の日なので、これらのテーマには加点してください。
${getWhatDay()}
現在の最新ニュースは以下なので、これらのテーマには加点してください。(ただし苦手な話題であれば加点は不要です)
${fetchJapaneseNews()}
commentにはこのscoreが出力されないようにしてください。
-----この下がユーザからの投稿です-----
ユーザ名: ${userinfo.follower.displayName}
文章: ${userinfo.posts?.[0] || ""}`;

  const result = await generateSingleResponseWithScore(prompt, userinfo);

  if (process.env.NODE_ENV === "development") {
    console.log(`[DEBUG][${userinfo.follower.did}] Score: ${result.score}`);
  }
  
  return result;
}
