import { UserInfoGemini } from "../types.js";
import { generateSingleResponse, getFullDateAndTimeString } from "./util.js";

export async function generateWhimsicalPost(userinfo: UserInfoGemini) {
  const prompt =
`現在、${getFullDateAndTimeString()}です。
あなたの気まぐれでSNSに投稿する文章をこれから生成します。
以下を含めた文章を生成してください。
* フォロワーへの挨拶
* この時間何をしていたかを言ってください
* これまで見ていたポストの中でも以下のユーザの投稿が特に面白かったこと。具体的に面白かったポイントを言ってください
以下がユーザ名およびポストです。
-----
ユーザ名: ${userinfo.follower.displayName}
ポスト内容: ${userinfo.posts || ""}
`;

  const response = await generateSingleResponse(prompt, userinfo);

  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  const result = response.text?.split("-----")[0];

  return result || "";
}
