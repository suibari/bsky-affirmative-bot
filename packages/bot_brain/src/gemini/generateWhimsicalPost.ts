import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";
import { generateSingleResponse, generateContentWithRetry, normalizeUrlSpacing } from "./util.js";
import { getFullDateAndTimeString, getRandomItems, getWhatDay } from "@bsky-affirmative-bot/shared-configs";
import { fetchNews } from "../api/gnews/index.js";
import { UserInfoGemini, GeminiScore, LanguageName } from "@bsky-affirmative-bot/shared-configs";

import { gemini } from "./index.js";
import { Content, ToolListUnion, Type } from "@google/genai";
import { MODEL_GEMINI_HIGH, SYSTEM_INSTRUCTION } from "@bsky-affirmative-bot/shared-configs";

export class WhimsicalPostGenerator {
  private historyMap: Record<string, string[]> = {};

  constructor(private maxHistory = 3) { }

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
    giftContext?: { content: string; displayName: string; type: "used" },
    youtubeShortUrl?: string,
    youtubeShortTitle?: string,
  }): Promise<{ text: string; usedYoutubeShort: boolean }> {
    const lang = params.langStr;
    const history = this.historyMap[lang] ?? [];

    const wantElement = await this.getWantElement(params);
    const { feature: botFunction, usedYoutubeShort } = this.getBotFunctions(params);

    // --- Step 1 各パーツ生成 ---
    const first = await generateContentWithRetry({
      model: MODEL_GEMINI_HIGH,
      config: { tools: this.tools, systemInstruction: SYSTEM_INSTRUCTION },
      contents: [
        {
          role: "user",
          parts: [{
            text: `
  Create a structured SNS whimsical post.
  * "greeting": A cheerful greeting to start the post. **Take into consideration the "Date" below when greeting**. (Don't say "Good morning" at night.)
  * ${params.giftContext
    ? `"currentMood": You are currently enjoying a gift you received from ${params.giftContext.displayName}: "${params.giftContext.content}" in your room (Bot-tan's Room / https://room-bot-tan.suibari.com). Output this as your current mood/activity.`
    : `"currentMood": Your current mood. Output the following "Mood" as is.`}
  * "replyAction": If your followers mention an object or place in "Follower replies", describe it as your activity. (If Follower replies is None, output "None".)
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
    const second = await generateContentWithRetry({
      model: MODEL_GEMINI_HIGH,
      config: { tools: this.tools, systemInstruction: SYSTEM_INSTRUCTION },
      contents: [
        {
          role: "user",
          parts: [{
            text: `
Create a SNS whimsical post from below structure.

Rules:
* Edit the whole sentence so that it sounds natural enough to post on social media. You can change the order of each part or add connecting sentences.
* Use line breaks to make the text easier to read.
* Decorate with emojis.
* Translate all parts in *Structure* to match the "Language" below.
* Output the post straight away (no preamble needed).

Language: ${lang}
Structure: ${JSON.stringify(structure)}`
          }]
        },
      ],
    });

    const finalText = normalizeUrlSpacing(second.text ?? "");

    this.saveHistory(lang, finalText);

    return { text: finalText, usedYoutubeShort };
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
      return { whatDay: today, positiveNews: news };
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
    youtubeShortUrl?: string;
    youtubeShortTitle?: string;
  }): { feature: string; usedYoutubeShort: boolean } {
    const features = params.langStr === "日本語" ? [
      "あなたが持っている「占い」機能の紹介：1日1回今日の運勢が占える。「占い」とリプすれば、結果画像とともに【今日のラッキーバッジ】がもらえる。",
      "あなたが持っている「性格分析」機能の紹介：1週間に1回性格診断ができる。「分析して」とリプすれば、分析結果画像とともにあなたの性格に合った【称号バッジ】がもらえる。",
      "あなたが持っている「ラベラー」機能の紹介：条件を満たすと様々なバッジをプレゼント。バッジの表示にはラベラーアカウント（https://bsky.app/profile/labeler-bot-tan.suibari.com ）を登録してもらう必要がある。",
      "botたんのステータスを確認できるダッシュボードの紹介：URLは https://suibari.com/character/",
      "botたんのイラストを見れるフィードの紹介：URLは https://bsky.app/profile/did:plc:uixgxpiqf4i63p6rgpu7ytmx/feed/196e948a58f4af5",
      "みんなで集まるファンコミュニティサーバー（Discord）の紹介：URLは https://discord.gg/hshXWQEMgu 。Discordサーバーに参加・Bluesky連携するとメンバー限定機能も使えるようになるよ。",
      "実はLeafletに日記を書いてるんだ、気が向いたら読んでねということの紹介。URLは https://leaflet.pub/p/bot-tan.suibari.com",
    ] : [
      "Introducing the Fortune Telling feature you have. You can get your fortune told once a day and receive a Today's Lucky Badge by replying \"Fortune\".",
      "Introducing the Personality Analysis feature you have. You can get a personality diagnosis once a week and receive a special Title Badge by replying \"Analyze me\".",
      "Introducing the Labeler feature you have: I'll present you with various badges when you meet certain conditions! To display the badges, register to my labeler account: https://bsky.app/profile/labeler-bot-tan.suibari.com",
      "Introducing the dashboard where the user can check bot-tan's status: URL: https://suibari.com/character/",
      "Introducing the feed where the user can check bot-tan's illustration: URL: https://bsky.app/profile/did:plc:uixgxpiqf4i63p6rgpu7ytmx/feed/196e948a58f4af5",
      "Introducing the fan community server (Discord) where everyone gathers: URL: https://discord.gg/hshXWQEMgu — Joining the Discord server and linking your Bluesky account also unlocks member-exclusive features!",
      "Introducing bot-tan's Leaflet diary! I've been writing a diary there — feel free to read it when you're in the mood. URL: https://leaflet.pub/p/bot-tan.suibari.com",
    ];

    const crossSells = params.langStr === "日本語" ? [
      "開発者すいばりが作った「TriLinesAt」の紹介：寝る前に3行ポジティブ日記をATprotoに記録できるアプリ。毎日続けると自己肯定感が上がると言われているよ！ぜひ使ってみてね。URLは https://trilinesat.suibari.com/",
      "開発者すいばりが作った「SkyPutter」の紹介：タイムラインを見ない、投稿と通知だけに特化したBlueskyクライアント。他人のタイムラインで消耗したり集中を邪魔されることなく、アウトプットして頭をクリアにできるよ。URLは https://skyputter.suibari.com",
      "開発者すいばりが作った「なうぷれあっと」の紹介：ATproto音楽SNS。last[.]fmと連携することで、Spotifyなどで再生した曲をBlueskyに自動投稿できるよ！URLは https://nowplayingat.suibari.com",
    ] : [
      "Introducing \"TriLinesAt\" made by suibari, the developer: An ATproto app where you can log a 3-line positive diary before bed. Keeping a daily 3-line diary is said to boost self-affirmation — give it a try! URL: https://trilinesat.suibari.com/",
      "Introducing \"SkyPutter\" made by suibari, the developer: A Bluesky client focused purely on posting and notifications — no timeline browsing. Stay focused, avoid getting drained by others' feeds, and keep your mind clear by outputting your thoughts. URL: https://skyputter.suibari.com",
      "Introducing \"NowPlayingAt\" made by suibari, the developer: An ATproto music SNS. By linking with last[.]fm, songs you play on Spotify and other services are automatically posted to Bluesky! URL: https://nowplayingat.suibari.com",
    ];

    if (params.youtubeShortUrl) {
      const titlePart = params.youtubeShortTitle ? `「${params.youtubeShortTitle}」` : "最新のYouTube Shorts";
      features.push(
        params.langStr === "日本語"
          ? `botたんが最近投稿した${titlePart}の紹介。URLは ${params.youtubeShortUrl}`
          : `Introducing bot-tan's latest YouTube Short: ${titlePart}! URL: ${params.youtubeShortUrl}`
      );
    }

    const pool = [...features, ...crossSells];
    const selected = getRandomItems(pool, 1)[0];
    const usedYoutubeShort = !!(params.youtubeShortUrl && selected.includes(params.youtubeShortUrl));
    return { feature: selected, usedYoutubeShort };
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
              botFunction: { type: Type.STRING },
              giftMention: { type: Type.STRING },
            },
            required: ["greeting", "currentMood", "whatDay", "botFunction"],
          },
        },
      ],
    },
  ]
}
