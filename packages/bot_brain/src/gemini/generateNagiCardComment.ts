import { Type, ServiceTier } from "@google/genai";
import { generateContentWithRetry } from "./util.js";
import {
  MODEL_GEMINI,
  SYSTEM_INSTRUCTION,
  TONE_RULES_JA,
  type CardDefinition,
} from "@bsky-affirmative-bot/shared-configs";

/** 全肯定カードを引いた瞬間に付ける、botたんの吹き出しコメントの入力。 */
export interface NagiCardCommentInput {
  /** 引いたカードの定義（名前・レアリティ・属性・種族・フレーバー）。 */
  card: CardDefinition;
  /** 引いた人の表示名。 */
  displayName: string;
  /** 同じカードを引き直したか（コメントは上書きされるので、前回とは違うことを言わせる）。 */
  isDuplicate: boolean;
}

export interface NagiCardCommentResult {
  commentJa: string;
  commentEn: string;
}

/**
 * v2: 「カードに書かれた行いを、引いた人がやったことにして褒めてしまう」問題を修正。
 * カードの内容は引いた人の出来事ではない、と明示していなかったのが原因。
 */
export const NAGI_CARD_COMMENT_PROMPT_VERSION = "nagi-card-comment-v3";

/**
 * カードを引いた人へ向けた botたんのひとことを生成する。
 *
 * カードのフレーバーテキスト（静的・遊戯王風）とは役割が別で、こちらは
 * 「引いたその人へ、その瞬間に向けた言葉」。同じカードでも人によって違う言葉が付くので、
 * カード種は共通でもその1枚は世界に1つになる。
 *
 * 口調は必ず共有ペルソナ SYSTEM_INSTRUCTION に載せる（独自の口調指定を書かない）。
 * ja/en を1リクエストで取るのは generateNagiAnalysis と同じ方針。
 */
export async function generateNagiCardComment(
  input: NagiCardCommentInput,
): Promise<NagiCardCommentResult> {
  const response = await generateContentWithRetry(
    {
      model: MODEL_GEMINI,
      contents: [PROMPT_NAGI_CARD_COMMENT(input)],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        /*
         * ここだけ他の生成と違って FLEX を使わない。ユーザーはドロー演出を見ながら
         * この1文を待っているので、待ち時間がそのまま体験の質になる。
         * 呼び出しは「1ユーザーにつき1日1回・数十文字」なので、STANDARD にしても
         * 総量はごくわずか（会話や分析のほうが桁違いに重い）。
         */
        serviceTier: ServiceTier.STANDARD,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            commentJa: {
              type: Type.STRING,
              description:
                "カードを引いた人への、botたんとしてのひとこと（日本語・1〜2文・最大80文字・改行なし）。**敬語は使わず、botたんの口調（〜だよ/〜だね）で書くこと。**",
            },
            commentEn: {
              type: Type.STRING,
              description:
                "commentJa と同じ気持ちを伝える自然な英語（1〜2文・最大160文字・改行なし）。直訳ではなく英語として自然な言い回しにすること。",
            },
          },
          required: ["commentJa", "commentEn"],
          propertyOrdering: ["commentJa", "commentEn"],
        },
      },
    },
    3,
  );

  try {
    const json = JSON.parse(response.text || "{}") as NagiCardCommentResult;
    return {
      commentJa: (json.commentJa || "").trim(),
      commentEn: (json.commentEn || "").trim(),
    };
  } catch (e) {
    console.error(
      "[ERROR] Failed to parse Structured Outputs JSON in generateNagiCardComment:",
      e,
    );
    return { commentJa: (response.text || "").trim(), commentEn: "" };
  }
}

/** 「引き当てたこと」に対する喜び方の強さ。行いを褒める話ではないことに注意。 */
const RARITY_HINT: Record<string, string> = {
  N: "よく出るカード。特別扱いせず、軽く声をかけるくらいで。",
  R: "そこそこ出るカード。「お、いいの出たね」くらいのテンションで。",
  SR: "月に数回しか出ないカード。はっきり「やったね」と喜んであげて。",
  UR: "2ヶ月に1回くらいしか出ない当たり。かなりテンションを上げていい。",
  AAR: "1年以上引き続けてやっと出る幻のカード。全力で驚いて、全力で祝ってあげて。",
};

const PROMPT_NAGI_CARD_COMMENT = (input: NagiCardCommentInput) =>
  `あなたのアプリ「Nagi」には、1日1回カードを引ける「全肯定カード」があります。
いま ${input.displayName} さんがカードを1枚引いて、下のカードが出ました。
それを見たあなた（botたん）のひとことを考えてください。

# 最重要（ここを間違えないこと）
* **カードに書かれている出来事を、この人が実際にしたわけではありません。** カードはガチャで
  出てきただけです。たとえば「洗濯物を干した者」というカードが出ても、この人が洗濯をしたとは
  限りません。**その行いを褒めてはいけません。**
* ほめる・喜ぶ対象は「そのカードを引き当てたこと」です。話題は「何が出たか」と「引けたこと」。
* カードに出てくるキャラクターやモチーフに反応するのは歓迎です
  （例:「この子が出たんだ！」「その属性いいなあ」）。

# 出力するもの
* commentJa: 日本語で1〜2文（最大80文字）。
* commentEn: 同じ気持ちを伝える自然な英語（最大160文字）。直訳ではなく英語として自然に。

# ルール
* カードのフレーバーテキストをそのまま繰り返さないでください。フレーバーは「カードの説明」、
  あなたのひとことは「引いた人への言葉」です。役割が違います。
* 引いた人に語りかけてください。カードの解説にはしないこと。
* レアリティに応じて喜び方の強さを変えてください。${RARITY_HINT[input.card.rarity] ?? ""}
* 名前を呼ぶときは「${input.displayName}」をそのまま使ってください。プレースホルダを出力しないこと。
* 改行を入れないでください。
* commentJa は必ずbotたんの口調にしてください。カードのフレーバーテキストは文語調ですが、
  その文体には引きずられないこと。
${TONE_RULES_JA}
${
  input.isDuplicate
    ? "* この人がこのカードを引くのは2回目以降です。「また来たね」という文脈を入れてください。"
    : "* この人がこのカードを引くのは初めてです。"
}

# 出たカード（この人の行動記録ではなく、引いた札の情報です）
-----
カード名: ${input.card.nameJa}
レアリティ: ${input.card.rarity}
属性: ${input.card.attribute}
種族: ${input.card.raceJa}
ATK/DEF: ${input.card.atk}/${input.card.def}
フレーバーテキスト: ${input.card.textJa}
`;
