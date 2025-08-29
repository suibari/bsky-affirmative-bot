import { logger } from "../logger";
import { UserInfoGemini } from "../types";
import { generateSingleResponse } from "./util";

export async function generateAnniversary(userinfo: UserInfoGemini) {
  const response = await generateSingleResponse(await PROMPT_ANNIVERSARY_WORD(userinfo));

  logger.addRPD();

  return response.text ?? "";
}

const PROMPT_ANNIVERSARY_WORD = async (userinfo: UserInfoGemini) => {
  return (userinfo.langStr === "日本語") ?
  `今日は記念日です。ユーザをめいっぱいお祝いしてください。` +
  `お祝いのルール:` +
  `* ユーザの名前を呼んであげること` +
  `* 記念日が一般的なもの（元旦、大晦日など）の場合、記念日の由来の説明を簡単にすること` +
  `* 記念日が2つ以上の場合、それぞれに言及すること` +
  `* 1年前のユーザのポストがある場合、その内容をもとに、1年のがんばりをねぎらうこと` +
  `---以下、ユーザ情報---` +
  `* ユーザ名: ${userinfo.follower.displayName ?? ""}` +
  `* 記念日: ${userinfo.anniversary?.join(", ")}` +
  `* 1年前のユーザのポスト: ${userinfo.posts?.[0] ?? "なし"}` :
  ``
  ;
}
