import { gemini } from "./index.js";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "../config/index.js";
import { UserInfoGemini } from "../types.js";

export async function generateAnalyzeResult(userinfo: UserInfoGemini) {
  const part_language = `${userinfo.langStr === "日本語" ? "日本語" : "英語"}で回答は生成してください。`;

  const prompt =
`ユーザのBlueskyポスト100件を基に、性格分析をしてください。
${part_language}
${userinfo.langStr === "日本語" ? "文字数は500文字程度としてください。" : "文字数は400文字程度としてください。"}
空の行は入れないでください。
絵文字は使わないでください。
分析結果は以下の要素をに基づいて生成してください。具体的なポスト内容に言及してください。
* ポジティブなポストの割合
* どんな趣味を持っているか
* 相性の良さそうな人
* 改善すべき点、心がけるといいこと
悪い内容は含まず、全肯定のスタンスで分析してください。
以下がユーザ名およびポストです。
-----
ユーザ名: ${userinfo.follower.displayName}
ポスト内容: ${userinfo.posts || ""}
`;

  const response = await gemini.models.generateContent({
    model: MODEL_GEMINI,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    }
  });

  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  const result = response.text?.split("-----")[0];

  return result ?? "";
}
