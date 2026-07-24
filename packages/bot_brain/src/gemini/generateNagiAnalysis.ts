import { Type, ServiceTier } from "@google/genai";
import { generateContentWithRetry } from "./util.js";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "@bsky-affirmative-bot/shared-configs";

/** 自動分析（プロフィールの「botたんのひとこと」）の入力。 */
export interface NagiAnalysisInput {
  /** 対象ユーザーの表示名（プロンプトに載せる）。 */
  displayName: string;
  /** ユーザー自身の投稿本文（Bluesky 投稿 or Nagi 投稿）。 */
  posts: string[];
  /** ユーザーがいいね/リアクションした投稿本文（趣味・相性の参考。任意）。 */
  liked?: string[];
  /** サブスク会員なら高品質ティアを使う。 */
  isSubscriber?: boolean;
}

/** 自動分析の結果。称号は生成しない（本文のみ / ja・en を1リクエストで取得）。 */
export interface NagiAnalysisResult {
  analysisJa: string;
  analysisEn: string;
}

export const NAGI_ANALYSIS_PROMPT_VERSION = "nagi-analysis-v1";

/**
 * botたんとしてユーザーの性格分析（「ひとこと」）を生成する。
 * generateAnalyzeResult（Bluesky bot 用・1言語＋称号）とは別に、Nagi 用として
 * 日本語と英語の本文を **1回の構造化リクエスト** で得る（責務: 本文のみ、称号は扱わない）。
 * 共有ペルソナ SYSTEM_INSTRUCTION を systemInstruction に載せ、口調のぶれを防ぐ。
 */
export async function generateNagiAnalysis(
  input: NagiAnalysisInput,
): Promise<NagiAnalysisResult> {
  const prompt = PROMPT_NAGI_ANALYSIS(input);

  const response = await generateContentWithRetry({
    model: MODEL_GEMINI,
    contents: [prompt],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      serviceTier: input.isSubscriber ? ServiceTier.STANDARD : ServiceTier.FLEX,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          analysisJa: {
            type: Type.STRING,
            description:
              "性格分析の本文（日本語・最大500文字・空行を含めない）。具体的なポストやいいね/リアクション内容に言及し、全肯定のスタンスで分析すること。",
          },
          analysisEn: {
            type: Type.STRING,
            description:
              "analysisJa と同じ意味・情報量の自然な英訳（最大1000文字・空行を含めない）。",
          },
        },
        required: ["analysisJa", "analysisEn"],
        propertyOrdering: ["analysisJa", "analysisEn"],
      },
    },
  }, 3);

  try {
    const responseText = response.text || "{}";
    const cleanedText = responseText.replace(/\[.*?\]/gs, "");
    const json = JSON.parse(cleanedText) as NagiAnalysisResult;
    return {
      analysisJa: json.analysisJa || "",
      analysisEn: json.analysisEn || "",
    };
  } catch (e) {
    console.error(
      "[ERROR] Failed to parse Structured Outputs JSON in generateNagiAnalysis:",
      e,
    );
    return { analysisJa: response.text || "", analysisEn: "" };
  }
}

const PROMPT_NAGI_ANALYSIS = (input: NagiAnalysisInput) =>
  `ユーザ自身のポストと、ユーザがいいね/リアクションしたポストを基に、性格分析をしてください。
分析結果は日本語（analysisJa）と英語（analysisEn）の両方を出力してください。両者は同じ意味・情報量にしてください。
日本語は最大500文字、英語は最大1000文字。どちらも空の行は入れないでください。
分析は以下の要素に基づいて生成し、具体的なポスト内容やいいね/リアクション内容に言及してください。
* ポジティブなポストの割合
* どんな趣味を持っているか（ユーザのポストおよびいいね/リアクションから分析する）
* 相性の良さそうな人（いいね/リアクションから分析する）
* 心がけるといいこと
# ルール
* 悪い内容は含まず、全肯定のスタンスで分析してください。
* ユーザがいいね/リアクションしたポストは、ユーザ自身のポストではありません。趣味の参考としてのみ参照してください。
* 称号は考えなくてよいです（本文のみ）。

以下がユーザ名およびポスト、いいね/リアクションしたポストです。
-----
ユーザ名: ${input.displayName}
ポスト内容: ${input.posts.join("\n") || ""}
ユーザがいいね/リアクションしたポスト: ${(input.liked ?? []).join("\n") || ""}
`;
