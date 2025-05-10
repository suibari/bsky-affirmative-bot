import { UserInfoGemini } from "../types.js";
import { generateSingleResponse } from "./util.js";

export async function generateCheerResult(userinfo: UserInfoGemini) {
  const part_language = `${userinfo.langStr === "日本語" ? "日本語" : "英語"}で回答は生成してください。`;

  const prompt =
`ユーザが添付画像を拡散したがっています。
この画像の良いところ・見るべきポイントを、他のBlueskyユーザ向けに宣伝してあげてください。
${part_language}
空の行は入れないでください。
悪い内容は含まず、全肯定のスタンスで宣伝してください。
以下がユーザ名およびポストです。
-----
ユーザ名: ${userinfo.follower.displayName}
ポスト内容: ${userinfo.posts || ""}
`;

  const response = await generateSingleResponse(prompt, userinfo);

  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  const result = response.text?.split("-----")[0];

  // 末尾にハッシュタグを付与し返却
  const hashtag = userinfo.langStr === "日本語" ? " #全肯定応援団" : " #SuiBotSquad";
  return result ? result + hashtag : "";
}
