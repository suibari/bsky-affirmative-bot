import { logger } from "../index.js";
import { UserInfoGemini } from "../types.js";
import { generateSingleResponse } from "./util.js";

export async function generateRecapResult(userinfo: UserInfoGemini) {
  const prompt = PROMPT_RECAP(userinfo);
  const response = await generateSingleResponse(prompt, userinfo);

  // Geminiリクエスト数加算
  logger.addRPD();

  return response ?? "";
}

const PROMPT_RECAP = (userinfo: UserInfoGemini) => {
  return userinfo.langStr === "日本語" ?
    `ユーザの今年の振り返りをしてください。
振り返り結果は以下の要素に基づいて生成してください。
* ユーザの今年のポストの総括
* ユーザがよく使う言葉 (特徴的な名詞をピックアップすること)
* ユーザがよく絡む相手 (全員の名前を挙げること)
* 今年の総括から言える、来年の抱負
# ルール
* 悪い内容は含まず、全肯定のスタンスで振り返りしてください
* 出力する文字数は500文字以内とします

以下がユーザ名およびポスト、いいねしたポストです。
-----
ユーザ名: ${userinfo.follower.displayName}
ポスト内容: ${userinfo.posts || ""}
ユーザがよく使う言葉: ${userinfo.topWords || ""}
ユーザがよく絡む相手: ${userinfo.followersFriend?.flat().map(follower => follower.profile.displayName).join(", ") || ""}
` :
    `Please provide a year-in-review for the user.
Generate the review results based on the following elements:
* Summary of the user's posts this year
* Words the user frequently uses (mention the most characteristic words)
* People the user frequently interacts with (mention all of them)
* Resolutions for next year by summary of this year
# Rules
* Do not include negative content; analyze from a fully positive stance.
* The text should be 1000 characters or less.

Below are the user name, posts, and posts they liked.
-----
Username: ${userinfo.follower.displayName}
Post content: ${userinfo.posts || ""}
Words frequently used by the user: ${userinfo.topWords || ""}
People the user frequently interacts with: ${userinfo.followersFriend?.flat().map(follower => follower.profile.displayName).join(", ") || ""}
`};
