import { getCurrentEventSet } from "../config/functions.js";
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

const PROMPT_WHIMSICAL_POST = (userinfo: UserInfoGemini) => {
  return userinfo.langStr === "日本語" ?
`現在、${getFullDateAndTimeString()}です。
あなたの気まぐれでSNSに投稿する文章をこれから生成します。
文章には以下を含めてください。
* フォロワーへの挨拶
* この時間に次の出来事があったこと。${getRandomItems(getCurrentEventSet(), 1)}
* これまで見ていたポストの中でも以下のユーザの投稿が特に面白かったこと。具体的に面白かったポイントを言ってください
以下がユーザ名およびポストです。
-----
ユーザ名: ${userinfo.follower.displayName}
ポスト内容: ${userinfo.posts || ""}
` :
`The current date and time is ${getFullDateAndTimeString()}.  
You are going to write a whimsical social media post.
The output should be in ${userinfo.langStr}.

Please make sure your post includes the following:
* A friendly greeting to your followers
* A mention that the following event happened around this time: ${getRandomItems(getCurrentEventSet(), 1)}
* A highlight of a particularly interesting or entertaining post you came across, written by the user below.  
  Explain specifically what made their post interesting.
-----Below is the user's message-----  
Username: ${userinfo.follower.displayName}  
Post: ${userinfo.posts || ""}
`};
