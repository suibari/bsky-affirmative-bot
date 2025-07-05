import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";
import { generateSingleResponse, getFullDateAndTimeString, getRandomItems, getWhatDay } from "./util.js";
import { fetchNews } from "../gnews/index.js";

const lastPosts: string[] = [];

export class WhimsicalPostGenerator {
  private lastPostsMap: Record<string, string[]> = {};

  constructor(private maxHistory = 3) {}

  async generate(params: {
    topFollower?: ProfileView,
    topPost?: string,
    langStr: string,
    currentMood: string,
  }) {
    const lang = params.langStr;
    const lastPosts = this.lastPostsMap[lang] ?? [];

    const prompt = await PROMPT_WHIMSICAL_POST({
      ...params,
      lastPosts
    });

    const response = await generateSingleResponse(prompt);
    const text = response.text || "";

    this.addPost(lang, text);
    return text;
  }

  private addPost(lang: string, text: string) {
    if (!this.lastPostsMap[lang]) this.lastPostsMap[lang] = [];
    this.lastPostsMap[lang].unshift(text);
    if (this.lastPostsMap[lang].length > this.maxHistory) {
      this.lastPostsMap[lang].pop();
    }
  }
}

const PROMPT_WHIMSICAL_POST = async (params: {
  topFollower?: ProfileView,
  topPost?: string,
  langStr: string,
  currentMood: string,
  lastPosts: string[],
}) => {
  return params.langStr === "日本語" ?
`現在、${getFullDateAndTimeString()}です。
あなたの気まぐれでSNSに投稿する文章をこれから生成します。
文章は最大500文字以内とします。
${lastPosts.length > 0 ? `あなたが過去ポストした次の内容と重複しないようにしてください: ${lastPosts}` : ""}
文章には以下を含めてください。
[MUST: 必ず含める]
* フォロワーへの挨拶
* あなたが次の気分・状態であることを、一言で説明。文章をそのまま出力せず、要約してください：${params.currentMood}
[WANT: あなたが一番面白いと思うものを**いずれか1つだけ**含める]
${await PROMPT_WHIMSICAL_WANT_PART(params)}
[MUST: 必ず含める]
${PROMPT_INTRO_BOT_FEATURE("日本語")}
` :
`The current date and time is ${getFullDateAndTimeString()}.  
You are going to write a whimsical social media post.
The output should be in **English**.
The output should be at most 600 characters.
${lastPosts.length > 0 ? `Do not repeat or overlap with the following your past posts: ${lastPosts}` : ""}
Please make sure your post includes the following:
[MUST: includes all of the following]
* A friendly greeting to your followers
* Explain your current mood/state in a single phrase. Do not repeat the input text directly—summarize it: ${params.currentMood}
[WANT: ideally include the thing you're **most** interested in right now]
${await PROMPT_WHIMSICAL_WANT_PART(params)}
[MUST: includes all of the following]
${PROMPT_INTRO_BOT_FEATURE("英語")}
`};

const PROMPT_WHIMSICAL_WANT_PART = async (params: {topFollower?: ProfileView, topPost?: string, langStr: string}) => {
  const prompt = params.langStr === "日本語" ?
    `
    1. 今日は何の日か紹介：${getRandomItems(getWhatDay(), 1)}
    2. 今日のポジティブニュースの紹介：${(await fetchNews("ja")).map(article => article.title)}
    ${params.topFollower && params.topPost ?
    `3. これまで見ていたポストの中で面白かった以下のポストの紹介。具体的に面白かったポイントを言ってください。
      以下がユーザ名、ハンドル名、ポストです。ハンドル名は、( @handle )というようにスペースを前後に入れてアットマークをつけてください。
      -----ユーザ名とポスト-----
      ユーザ名: ${params.topFollower.displayName}
      ハンドル名: ${params.topFollower.handle}
      ポスト内容: ${params.topPost || ""}` : ""
    }
    ` :
    `
    1. Introduce a piece of what day it is today in Japan: ${getRandomItems(getWhatDay(), 1)}
    2. Introduce a piece of positive news for today: ${(await fetchNews("en")).map(article => article.title)}
    ${params.topFollower && params.topPost ?
    `3. Introduce the following post that you found interesting among the ones you've seen. Be specific about what you found interesting.
      Here is the username, handle and the post content. To enter a handle name, enter an @sign followed by a space ( @handle ):
      ----- Username and Post -----
      Username: ${params.topFollower.displayName}
      handle: ${params.topFollower.handle}
      Post content: ${params.topPost || ""}` : ""
    }
    `;
  
  return prompt;
}

const PROMPT_INTRO_BOT_FEATURE = (langStr: string) => {
  const features = langStr === "日本語" ? [
    "あなたが持っている「占い」機能の紹介：1日1回今日の運勢が占える。「占い」とリプすればできる。",
    "あなたが持っている「性格分析」機能の紹介：1週間に1回性格診断ができる。「分析して」とリプすればできる。",
    "あなたが持っている「DJ」機能の紹介：あなたがユーザにおすすめの曲を選ぶ。「DJお願い」とリプすればできる。ただしサブスクメンバー限定。サブスクについてはbio欄参照。",
    "あなたが持っている「応援」機能の紹介：ユーザの作ったものをあなたがみんなにお知らせする。「#全肯定応援団」のタグをつければできる。ただしサブスクメンバー限定。サブスクについてはbio欄参照。",
    "あなたが持っている「日記」機能の紹介：ユーザの今日のポストを日記にしてお届け。「日記つけて」とリプすれば設定できる。毎晩あなたからユーザに日記を送る。ただしサブスクメンバー限定。サブスクについてはbio欄参照。",
  ] : [
    "Introducing the Fortune Telling feature you have. You can get your fortune told once a day by replying \"Fortune\"",
    "Introducing the Personality Analysis feature you have. You can get a personality diagnosis once a week by replying \"Analyze me\"",
    "Introducing the DJ feature you have. You choose songs you recommend to users by replying \"DJ, please\"",
    "Introducing the Cheering feature you have. You let everyone know what users have made by adding the tag \"#SuiBotCheerQquad\"",
    "Introducing the Diary feature you have. You can have users daily posts collected into a diary by replying \"Keep a diary\". You will keep a diary for the user every night.",
  ]
  return getRandomItems(features, 1);
}
