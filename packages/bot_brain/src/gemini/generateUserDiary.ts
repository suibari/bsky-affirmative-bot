import { Type } from "@google/genai";
import { gemini } from "./index.js";
import { generateContentWithRetry } from "./util.js";
import { UserInfoGemini, MODEL_GEMINI, SYSTEM_INSTRUCTION } from "@bsky-affirmative-bot/shared-configs";

export interface DiaryResult {
  diary: string;
  title_ja: string;
  title_en: string;
}

export async function generateUserDiary(userinfo: UserInfoGemini): Promise<DiaryResult> {
  const maxLength = userinfo.langStr === "日本語" ?
    "出力する日記本文の文字数は最大500文字までです。" :
    "The diary body content can be up to 1000 characters.";

  const prompt = userinfo.langStr === "日本語" ?
`ユーザの今日1日の日記をつけてあげてください。ユーザのポストを総括して、あなたの感想を述べてください。
日記の目的はユーザのストレスを軽減し、自律神経を整えて、明日へのモチベーションを高めることです。
日本語で出力してください。
${maxLength}
日記本文には以下の要素を含めてください。
* 今日失敗したこと
* 今日一番よかったこと、心が動いたこと
* 明日の目標
悪い内容は含まず、全肯定のスタンスで出力してください。

また、ユーザの今日1日のポスト内容や様子から、今日1日を象徴するユーザにふさわしい「称号」を考えてください。
称号は、日本語（20字以内）と、その英語訳（30字以内）の両方を考えてください。
例：
- 日本語: 「努力の守護者」, 英語: 「Guardian of Effort」
- 日本語: 「癒やしの案内人」, 英語: 「Guide of Healing」

以下がユーザ名およびポストです。
-----
ユーザ名: ${userinfo.follower.displayName}
今日1日のポスト内容: ${userinfo.posts || ""}
` :
`Please write a daily diary for the user. Summarize their posts and share your warm feedback.
The purpose of the diary is to reduce their stress, regulate their autonomic nervous system, and boost their motivation for tomorrow.
Please output in ${userinfo.langStr}.
${maxLength}
Include the following elements in the diary body:
* Today's challenges/failures (approached fully positively)
* Today's highlight/best moments
* Tomorrow's goals
Do not include any negative content; keep a fully positive, affirming stance.

Also, based on their posts, award them a fitting "title".
Provide the title in both Japanese (within 20 characters) and English (within 30 characters).
Examples:
- Japanese: 「努力の守護者」, English: 「Guardian of Effort」
- Japanese: 「全肯定の達人」, English: 「Master of Affirmation」

-----
Username: ${userinfo.follower.displayName}
Today's posts: ${userinfo.posts || ""}
`;

  const contents: any[] = [prompt];

  if (userinfo?.image) {
    for (const img of userinfo.image) {
      try {
        const response = await fetch(img.image_url);
        if (!response.ok) {
          console.warn(`[WARN] Failed to fetch image: ${img.image_url} (Status: ${response.status})`);
          continue;
        }
        const imageArrayBuffer = await response.arrayBuffer();
        const base64ImageData = Buffer.from(imageArrayBuffer).toString("base64");
        contents.push({
          inlineData: {
            mimeType: img.mimeType,
            data: base64ImageData,
          }
        });
      } catch (e) {
        console.warn(`[WARN] Error fetching image: ${img.image_url}`, e);
        continue;
      }
    }
  }

  const response = await generateContentWithRetry({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          diary: {
            type: Type.STRING,
            description: "今日1日の日記本文（今日失敗したこと、今日一番よかったこと、明日の目標を含め、全肯定のスタンスで書くこと）"
          },
          title_ja: {
            type: Type.STRING,
            description: "今日1日を象徴するユーザーにふさわしい日本語の称号（20字以内、例: 努力の守護者）"
          },
          title_en: {
            type: Type.STRING,
            description: "同じ称号の英語訳（30字以内、例: Guardian of Effort）"
          }
        },
        required: ["diary", "title_ja", "title_en"]
      }
    }
  });

  try {
    const responseText = response.text || "{}";
    const cleanedText = responseText.replace(/\[.*?\]/gs, '');
    const json = JSON.parse(cleanedText) as DiaryResult;
    return {
      diary: json.diary || "",
      title_ja: json.title_ja || "全肯定の旅人",
      title_en: json.title_en || "Affirmative Traveler"
    };
  } catch (e) {
    console.error("[ERROR] Failed to parse Structured Outputs JSON in generateUserDiary:", e);
    return {
      diary: response.text || "",
      title_ja: "全肯定の旅人",
      title_en: "Affirmative Traveler"
    };
  }
}
