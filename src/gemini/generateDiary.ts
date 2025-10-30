import { logger } from "../index.js";
import { UserInfoGemini } from "../types.js";
import { generateSingleResponse } from "./util.js";

export async function generateDiary(userinfo: UserInfoGemini) {
  const maxLength = userinfo.langStr === "日本語" ?
    "出力する文字数は最大500文字までです。" :
    "出力する文字数は最大1000文字までです。"

  const prompt =
`ユーザの今日1日の日記をつけてあげてください。ユーザのポストを総括して、あなたの感想を述べてください。
日記の目的はユーザのストレスを軽減し、自律神経を整えて、明日へのモチベーションを高めることです。
${userinfo.langStr}で出力してください。
${maxLength}
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

  // Geminiリクエスト数加算
  logger.addRPD();

  return response ?? "";
}
