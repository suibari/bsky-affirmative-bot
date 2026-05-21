
import { UserInfoGemini } from "@bsky-affirmative-bot/shared-configs";
import { generateSingleResponse, extractJSON } from "./util.js";

export interface DiaryResult {
  diary: string;
  title_ja: string;
  title_en: string;
}

export async function generateDiary(userinfo: UserInfoGemini): Promise<DiaryResult> {
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

出力は、必ず以下のJSONフォーマットの構造にしてください。余計な説明文は含めず、Markdownのjsonコードブロック（\`\`\`json ... \`\`\`）のみで出力してください。
\`\`\`json
{
  "diary": "日記の本文...",
  "title_ja": "日本語の称号",
  "title_en": "英語の称号"
}
\`\`\`

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

You MUST output strictly in the following JSON format. Wrap it in a markdown json code block:
\`\`\`json
{
  "diary": "The content of the diary...",
  "title_ja": "Japanese Title",
  "title_en": "English Title"
}
\`\`\`

-----
Username: ${userinfo.follower.displayName}
Today's posts: ${userinfo.posts || ""}
`;

  const response = await generateSingleResponse(prompt, userinfo);
  
  try {
    const json = extractJSON(response || "{}") as DiaryResult;
    return {
      diary: json.diary || "",
      title_ja: json.title_ja || "全肯定の旅人",
      title_en: json.title_en || "Affirmative Traveler"
    };
  } catch (e) {
    console.error("[ERROR] Failed to parse generateDiary JSON, falling back to plaintext:", e);
    // フォールバック
    return {
      diary: response || "",
      title_ja: "全肯定の旅人",
      title_en: "Affirmative Traveler"
    };
  }
}

