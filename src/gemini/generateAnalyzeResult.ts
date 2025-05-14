import { UserInfoGemini } from "../types.js";
import { generateSingleResponse } from "./util.js";

export async function generateAnalyzeResult(userinfo: UserInfoGemini) {
  const part_language = `${userinfo.langStr === "日本語" ? "日本語" : "英語"}で生成してください。`;

  const prompt =
`ユーザ自身のポストといいねしたポストを基に、性格分析をしてください。
${part_language}
${userinfo.langStr === "日本語" ? "文字数は500文字程度としてください。" : "文字数は400文字程度としてください。"}
空の行は入れないでください。
絵文字は使わないでください。
分析結果は以下の要素に基づいて生成してください。具体的なポスト内容やいいね内容に言及してください。
* ポジティブなポストの割合
* どんな趣味を持っているか
* 相性の良さそうな人
* 心がけるといいこと
悪い内容は含まず、全肯定のスタンスで分析してください。
以下がユーザ名およびポスト、いいねしたポストです。
-----
ユーザ名: ${userinfo.follower.displayName}
ポスト内容: ${userinfo.posts || ""}
いいね内容: ${userinfo.likedByFollower || ""}
`;

  const response = await generateSingleResponse(prompt, userinfo);

  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  const result = response.text?.split("-----")[0];

  return result ?? "";
}
