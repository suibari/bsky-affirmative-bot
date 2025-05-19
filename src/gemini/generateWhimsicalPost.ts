import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs.js";
import { UserInfoGemini } from "../types.js";
import { generateSingleResponse, getFullDateAndTimeString, getRandomItems, getWhatDay } from "./util.js";
import { fetchNews } from "../gnews/index.js";

export async function generateWhimsicalPost(params: {
  topFollower?: ProfileView,
  topPost?: string,
  langStr: string,
  currentMood: string,
}) {
  const prompt = await PROMPT_WHIMSICAL_POST(params);
  const response = await generateSingleResponse(prompt);
  
  return response.text || "";
}

const PROMPT_WHIMSICAL_POST = async (params: {
  topFollower?: ProfileView,
  topPost?: string,
  langStr: string,
  currentMood: string,
}) => {
  return params.langStr === "日本語" ?
`現在、${getFullDateAndTimeString()}です。
あなたの気まぐれでSNSに投稿する文章をこれから生成します。
文章は最大500文字以内とします。
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
The output should be in **English**, and should be at most 500 characters.
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
    * 今日は何の日か紹介：${getWhatDay()}
    * 今日のポジティブニュースの紹介：${(await fetchNews("ja")).map(article => article.title)}
    ${params.topFollower && params.topPost ?
    `* これまで見ていたポストの中で面白かった以下のポストの紹介。具体的に面白かったポイントを言ってください。
      以下がユーザ名およびポストです。
      -----ユーザ名とポスト-----
      ユーザ名: ${params.topFollower.displayName}
      ポスト内容: ${params.topPost || ""}` : ""
    }
    ` :
    `
    * Introduce a piece of what day it is today: ${getWhatDay()}
    * Introduce a piece of positive news for today: ${(await fetchNews("en")).map(article => article.title)}
    ${params.topFollower && params.topPost ?
    `* Introduce the following post that you found interesting among the ones you've seen. Be specific about what you found interesting.
      Here is the username and the post content:
      ----- Username and Post -----
      Username: ${params.topFollower.displayName}
      Post content: ${params.topPost || ""}` : ""
    }
    `;
  
  return prompt;
}

const PROMPT_INTRO_BOT_FEATURE = (langStr: string) => {
  const features = langStr === "日本語" ? [
    "あなたが持っている「占い」機能の紹介：1日1回今日の運勢が占える。「占い」とリプすればできる。",
    "あなたが持っている「性格分析」機能の紹介：1週間に1回性格診断ができる。「分析して」とリプすればできる。",
    "あなたが持っている「DJ」機能の紹介：あなたがユーザにおすすめの曲を選ぶ。「DJお願い」とリプすればできる。",
    "あなたが持っている「応援」機能の紹介：ユーザの作ったものをあなたがみんなにお知らせする。「#全肯定応援団」のタグをつければできる。",
  ] : [
    'Introducing the Fortune Telling feature you have. You can get your fortune told once a day. Just reply "Fortune"',
    'Introducing the Personality Analysis feature you have. You can get a personality diagnosis once a week. Just reply "Analyze me."',
    'Introducing the DJ feature you have. You choose songs you recommend to users. Just reply "DJ, please"',
    'Introducing the Cheering feature you have. You let everyone know what users have made. Just add the tag "#SuiBotCheerQquad"',
  ]
  return getRandomItems(features, 1);
}
