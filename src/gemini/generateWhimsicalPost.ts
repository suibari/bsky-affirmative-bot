import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";
import { generateSingleResponse, getFullDateAndTimeString, getRandomItems, getWhatDay } from "./util.js";
import { fetchNews } from "../gnews/index.js";
import { LanguageName } from "../types.js";
import { logger } from "../index.js";
import { gemini } from "./index.js";
import { Content, ToolListUnion, Type } from "@google/genai";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "../config/index.js";

export class WhimsicalPostGenerator {
  private historyMap: Record<string, string[]> = {};

  constructor(private maxHistory = 3) {}

  /**
   * つぶやきを生成する外部関数
   * @param params 
   * @returns 
   */
  async generate(params: {
    topFollower?: ProfileView,
    topPost?: string,
    langStr: LanguageName,
    currentMood: string,
    userReplies?: string[],
  }) {
    const lang = params.langStr;
    const history = this.historyMap[lang] ?? [];

    const wantElement = await this.getWantElement(params);
    const botFunction = this.getBotFunctions(params);

    // --- Step 1 各パーツ生成 ---
    const first = await gemini.models.generateContent({
      model: MODEL_GEMINI,
      config: { tools: this.tools, systemInstruction: SYSTEM_INSTRUCTION },
      contents: [
        {
          role: "user",
          parts: [{ text: `
  Create a structured SNS whimsical post.
  * "greeting": A cheerful greeting to start the post. **Take into consideration the "Date" below when greeting**. (Don't say "Good morning" at night.)
  * "currentMood": Your current mood. Output the following "Mood" as is.
  * "replyAction": If your followers mention an object or place in "Follower replies", feature it as your activity. (If Follower replies is None, output "None".)
  * "whatDay": What day is it today? Please choose one that interests you and explain what kind of day it is.
  * "positiveNews": Positive news. Pick one thing that you think is positive. (If None, output "None".)
  * "BotFunction": An introduction to the features you have.

  Avoid repeating past posts: ${JSON.stringify(history)}

  Date: ${getFullDateAndTimeString()}
  Language: ${lang}
  Mood: ${params.currentMood}
  Follower replies: ${JSON.stringify(params.userReplies) ?? "none"}
  What day is Today: ${wantElement.whatDay}
  All news: ${wantElement.positiveNews ?? "none"}
  BotFunction: ${botFunction}

  Return a function call to composePostStructure.`
          }]
        }
      ],
    });

    const call = first.functionCalls?.[0];
    if (!call) {
      throw new Error("Gemini did not return a functionCall for composePostStructure");
    }

    console.log(`[DEBUG][WHIMSICAL] First call args: ${JSON.stringify(call.args)}`);
    const structure = call.args;

    // --- Step 2: 最終文章生成 ---
    const second = await gemini.models.generateContent({
      model: MODEL_GEMINI,
      config: { tools: this.tools, systemInstruction: SYSTEM_INSTRUCTION },
      contents: [
        {
          role: "user",
          parts: [{ text: `
Create a SNS whimsical post from below structure.

Rules:
* Edit the whole sentence so that it sounds natural enough to post on social media. You can change the order of each part or add connecting sentences.
* Use line breaks to make the text easier to read.
* Decorate with emojis.
* The output language must be consistent with the following "Language".
* Output the post straight away (no preamble needed).

Language: ${lang}
Structure: ${JSON.stringify(structure)}`
          }]
        },
      ],
    });

    const finalText = second.text ?? "";

    this.saveHistory(lang, finalText);
    logger.addRPD();

    return finalText;
  }

  /**
   * つぶやきの履歴保存
   * @param lang 
   * @param text 
   */
  private saveHistory(lang: string, text: string) {
    if (!this.historyMap[lang]) this.historyMap[lang] = [];
    this.historyMap[lang].unshift(text);
    if (this.historyMap[lang].length > this.maxHistory) {
      this.historyMap[lang].pop();
    }
  }

  /**
   * 何の日情報とニュース情報を取得
   */
  private async getWantElement(params: {
    langStr: LanguageName;
  }): Promise<{ whatDay: string[]; positiveNews?: string }> {

    if (params.langStr === "日本語") {
      const today = getWhatDay();
      const news = (await fetchNews("ja")).map(a => a.title).join(" / ");
      return { whatDay: today, positiveNews: news};
    } else {
      const today = getWhatDay();
      return { whatDay: today };
    }
  }

  /**
   * 紹介するbot機能をランダムで1つ取得
   * @param params 
   * @returns 
   */
  private getBotFunctions(params: {
    langStr: LanguageName;
  }) {
    const features = params.langStr === "日本語" ? [
      "あなたが持っている「AI限定化」機能の紹介：あなたが定型文を使わずにAIリプライのみで全肯定する。「AI限定モード」とリプすればできる。",
      "あなたが持っている「占い」機能の紹介：1日1回今日の運勢が占える。「占い」とリプすればできる。",
      "あなたが持っている「性格分析」機能の紹介：1週間に1回性格診断ができる。「分析して」とリプすればできる。",
      "あなたが持っている「DJ」機能の紹介：あなたがユーザにおすすめの曲を選ぶ。「DJお願い」とリプすればできる。ただしサブスクメンバー限定。サブスクについてはbio欄参照。",
      "あなたが持っている「応援」機能の紹介：ユーザの作ったものをあなたがみんなにお知らせする。「#全肯定応援団」のタグをつければできる。ただしサブスクメンバー限定。サブスクについてはbio欄参照。",
      "あなたが持っている「日記」機能の紹介：ユーザの今日のポストを日記にしてお届け。「日記つけて」とリプすれば設定できる。毎晩あなたからユーザに日記を送る。ただしサブスクメンバー限定。サブスクについてはbio欄参照。",
      "あなたが持っている「記念日」機能の紹介：ユーザの記念日をお祝い。「記念日登録、記念日名、MM/DD」とリプすれば設定できる。設定した記念日の当日にユーザをお祝いする。",
      "あなたが持っている「ステータス」機能の紹介：あなたとユーザのステータスを確認。「教えてステータス」とリプすればできる。",
      "あなたがこれまで選曲した曲のプレイリストがあることの紹介：URLも併せて紹介すること。URLは https://open.spotify.com/playlist/0rMAkyqQtxd4o8mIMja0sx です。",
    ] : [
      "Introducing the AI only mode feature you have. You will give affirmative replies using only AI without using predefined replies. You can enable it by replying \"AI only mode\".",
      "Introducing the Fortune Telling feature you have. You can get your fortune told once a day by replying \"Fortune\"",
      "Introducing the Personality Analysis feature you have. You can get a personality diagnosis once a week by replying \"Analyze me\"",
      "Introducing the DJ feature you have. You choose songs you recommend to users by replying \"DJ, please\". However, this is limited to subscribed followers. Please see the bio for details on subscriptions.",
      "Introducing the Cheering feature you have. You let everyone know what users have made by adding the tag \"#SuiBotCheerQquad\". However, this is limited to subscribed followers. Please see the bio for details on subscriptions.",
      "Introducing the Diary feature you have. You can have users daily posts collected into a diary by replying \"Keep a diary\". You will keep a diary for the user every night. However, this is limited to subscribed followers. Please see the bio for details on subscriptions.",
      "Introducing the Anniversary feature you have. Users can register their anniversary by replying \"register anniversary, [your anniversary name], MM/DD\". You will celebrate the user on the registered date.",
      "Introducing the Status feature you have. You can check the status of each function with you and the user by replying \"tell me status\".",
      "Introducing a playlist of songs you've selected so far: Include the URL. The URL is https://open.spotify.com/playlist/0rMAkyqQtxd4o8mIMja0sx.",
    ]
    return getRandomItems(features, 1)[0];
  }

  /** 
   * Gemini関数定義
   */
  private tools: ToolListUnion = [
    {
      functionDeclarations: [
        {
          name: "composePostStructure",
          description: "気まぐれポストの構造化データを作る",
          parameters: {
            type: Type.OBJECT,
            properties: {
              greeting: { type: Type.STRING },
              currentMood: { type: Type.STRING },
              replyAction: { type: Type.STRING },
              whatDay: { type: Type.STRING },
              positiveNews: { type: Type.STRING },
              botFunction: { type: Type.STRING }
            },
            required: ["greeting", "currentMood", "whatDay", "botFunction"],
          },
        },
      ],
    },
  ]
}
