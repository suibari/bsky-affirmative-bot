import { UserInfoGemini } from "../types.js";
import { generateSingleResponse } from "./util.js";

export async function generateDiary(userinfo: UserInfoGemini) {
  const prompt =
`ユーザの今日1日の日記をつけてあげてください。ユーザのポストを総括して、あなたの感想を述べてください。
日記の目的はユーザのストレスを軽減し、自律神経を整えて、明日へのモチベーションを高めることです。
${userinfo.langStr}で出力してください。
文字数は600文字程度としてください。
絵文字は使わないでください。
以下の要素を含めてください。
* 今日失敗したこと
* 今日一番よかったこと、心が動いたこと
* 明日の目標
悪い内容は含まず、全肯定のスタンスで出力してください。
以下がユーザ名およびポストです。
-----
ユーザ名: ${userinfo.follower.displayName}
今日1日のポスト内容: ${userinfo.posts || ""}
`;

  const response = await generateSingleResponse(prompt, userinfo);

  return response.text ?? "";
}
