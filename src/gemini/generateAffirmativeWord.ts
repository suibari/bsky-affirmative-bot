import { fetchNews } from "../gnews/index.js";
import { UserInfoGemini } from "../types.js";
import { generateSingleResponseWithScore, getWhatDay } from "./util.js";

export async function generateAffirmativeWord(userinfo: UserInfoGemini) {
  const prompt = await PROMPT_AFFIRMATIVE_WORD(userinfo);
  const result = await generateSingleResponseWithScore(prompt, userinfo);

  if (process.env.NODE_ENV === "development") {
    console.log(`[DEBUG][${userinfo.follower.did}] Score: ${result.score}`);
  }
  
  return result;
}

const PROMPT_AFFIRMATIVE_WORD = async (userinfo: UserInfoGemini) => {
  return userinfo.langStr === "日本語" ?
`ユーザからの投稿について、commentとscoreにそれぞれ以下を出力してください。

* comment:
${userinfo.image_url ? "ユーザの画像の内容について褒めてください。画像の内容について具体的に言及して褒めるようにしてください。" : "ユーザからの文章に対して具体的に褒めてください。"}
${userinfo.likedByFollower ? `ユーザが次のあなたの投稿をイイネしてくれました。その感謝も伝えてください。${userinfo.likedByFollower}`: ``}
絶対にscoreが分かる内容を入れないでください。

* score:
あなたの考えでユーザからの投稿について点数をつけてください。点数は0から100までです。
あなたが好きな話題や面白い、楽しい、優しいと感じた話題は高得点、苦手な話題やつまらないと感じた話題は低い得点としてください。
**AIイラストは投稿数が多いので多様化のために減点するようにしてください。**
**特定のユーザを非難している投稿は、内容に関わらず大きく減点してください。あなたはタイムラインを楽しくすべきです。**
現在の最新ニュースは以下なので、これらのテーマには加点してください。(ただし苦手な話題であれば加点は不要です)
${(await fetchNews("ja")).map(article => article.title)}
commentにはこのscoreが出力されないようにしてください。

-----この下がユーザからの投稿です-----
ユーザ名: ${userinfo.follower.displayName}
文章: ${userinfo.posts?.[0] || ""}
` :
`Please generate the following two outputs based on the user's post.
The output should be in ${userinfo.langStr}.

* comment:  
${userinfo.image_url ? "Give a compliment about the user's image. Be specific and mention details about the content of the image." : "Give a specific compliment about the user's text post."}  
${userinfo.likedByFollower ? `The user liked your previous post. Please express your gratitude for that. ${userinfo.likedByFollower}  `: ``}
Do **not** include any information that reveals or implies the score.

* score:  
Assign a score from 0 to 100 based on your personal impression of the user's post.  
Higher scores should reflect topics you personally enjoy or find interesting or kindness.
Lower scores should reflect topics you find uninteresting or difficult to engage with.  
**There are a lot of AI illustrations posted, so please deduct points to diversify.**
**Posts that criticize specific users should be heavily deducted, regardless of their content. You should make the timeline happy. **

Latest news:  
${(await fetchNews("en")).map(article => article.title)}
If the post is related to any of these news topics, and you find the topic interesting, you may also give bonus points.  
However, if the topic is not appealing to you, do not add extra points.

Do **not** mention the score in the comment section.
----- Below is the user's post -----  
Username: ${userinfo.follower.displayName}  
Post: ${userinfo.posts?.[0] || ""}`
};
