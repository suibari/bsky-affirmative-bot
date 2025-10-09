import { PartListUnion, Type } from "@google/genai";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "../config/index.js";
import { UserInfoGemini } from "../types.js";
import { gemini } from "./index.js";
import { logger } from "../index.js";

type GeminiRecommendation = [
  {
    title: string;
    artist: string;
    comment: string;
  }
]

export async function generateRecommendedSong(userinfo: UserInfoGemini) {
  const SCHEMA_DJBOT = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
        },
        artist: {
          type: Type.STRING,
        },
        comment: {
          type: Type.STRING,
        }
      },
      propertyOrdering: ["title", "artist", "comment"],
    }
  }

  const prompt = PROMPT_DJ(userinfo);
  const contents: PartListUnion = prompt;
  const response = await gemini.models.generateContent({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: SCHEMA_DJBOT,
      tools: [
        {
          googleSearch: {},
        }
      ]
    }
  });
  const result = JSON.parse(response.text || "") as GeminiRecommendation;

  // Geminiリクエスト数加算
  logger.addRPD();

  return result[0];
}

const PROMPT_DJ = (userinfo: UserInfoGemini) => {
  const requestPost = userinfo.posts?.[0];
  const pastPosts = (userinfo.posts && userinfo.posts.length > 1) ? userinfo.posts?.slice(1) : undefined;

  return userinfo.langStr === "日本語" ?
`以下のユーザが流す曲をリクエストしています。
ユーザの指定する雰囲気に合った曲を選曲してあげてください。
# ルール
* 実在しない曲は挙げてはいけません
* titleに曲名、artistにアーティスト名を、正確に出力してください
* commentには選曲に関するあなたのコメントを出力してください
* 選曲の際には過去のユーザのポストも参考にしてください: ${pastPosts}
-----この下がユーザからのリクエストです-----
ユーザ名: ${userinfo.follower.displayName}
リクエスト: ${requestPost}
` :
`The following user is requesting a song.
Please select a song that matches the atmosphere the user specifies.
If the user mentions any anime or game references, please choose a song related to those.
Do not suggest any songs that do not actually exist.
When choosing songs, please refer to past user posts: ${pastPosts}
The output should be in ${userinfo.langStr}.
-----Below is the user's request-----  
Username: ${userinfo.follower.displayName}  
Request: ${requestPost}
`};
