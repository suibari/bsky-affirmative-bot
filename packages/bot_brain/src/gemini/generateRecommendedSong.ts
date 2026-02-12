import { PartListUnion, Type } from "@google/genai";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "@bsky-affirmative-bot/shared-configs";
import { UserInfoGemini, GeminiScore } from "@bsky-affirmative-bot/shared-configs";
import { gemini } from "./index.js";

import { extractJSON } from "./util.js";

type GeminiRecommendation = [
  {
    title: string;
    artist: string;
    comment: string;
  }
]

export async function generateRecommendedSong(userinfo: UserInfoGemini) {
  // const SCHEMA_DJBOT = { ... } // Removed due to conflict with Google Search

  const prompt = PROMPT_DJ(userinfo);
  const contents: PartListUnion = [prompt]; // Fix: content should be array
  const response = await gemini.models.generateContent({
    model: MODEL_GEMINI,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      // responseMimeType: "application/json", // Removed
      // responseSchema: SCHEMA_DJBOT, // Removed
      tools: [
        {
          googleSearch: {},
        }
      ]
    }
  });

  const result = extractJSON(response.text || "") as GeminiRecommendation;

  // Geminiリクエスト数加算
  

  return result[0];
}

const PROMPT_DJ = (userinfo: UserInfoGemini) => {
  const requestPost = userinfo.posts?.[0];
  const pastPosts = (userinfo.posts && userinfo.posts.length > 1) ? userinfo.posts?.slice(1) : undefined;

  return userinfo.langStr === "日本語" ?
    `以下のユーザが流す曲をリクエストしています。
ユーザの指定する雰囲気に合った曲を選曲してあげてください。
以下のJSON形式で出力してください。
\`\`\`json
[
  {
    "title": "曲名",
    "artist": "アーティスト名",
    "comment": "コメント"
  }
]
\`\`\`

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
Please output in the following JSON format.
\`\`\`json
[
  {
    "title": "Song Title",
    "artist": "Artist Name",
    "comment": "Comment"
  }
]
\`\`\`

# Rules
If the user mentions any anime or game references, please choose a song related to those.
Do not suggest any songs that do not actually exist.
When choosing songs, please refer to past user posts: ${pastPosts}
The output should be in ${userinfo.langStr}.
-----Below is the user's request-----  
Username: ${userinfo.follower.displayName}  
Request: ${requestPost}
`;
};
