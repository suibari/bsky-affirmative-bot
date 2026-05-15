import { fetchNews } from "../api/gnews/index.js";

import { UserInfoGemini, GeminiScore } from "@bsky-affirmative-bot/shared-configs";
import { generateSingleResponseWithScore } from "./util.js";
import { getWhatDay } from "@bsky-affirmative-bot/shared-configs";

export async function generateAffirmativeWord(userinfo: UserInfoGemini) {
   const prompt = await PROMPT_AFFIRMATIVE_WORD(userinfo);
   const result = await generateSingleResponseWithScore(prompt, userinfo);

   if (process.env.NODE_ENV === "development") {
      console.log(`[DEBUG][${userinfo.follower.did}] Score: ${result.score}`);
   }

   // Geminiリクエスト数加算
   

   return result;
}

const PROMPT_AFFIRMATIVE_WORD = async (userinfo: UserInfoGemini) => {
   return userinfo.langStr === "日本語" ?
      `ユーザからの投稿について、以下のJSON形式で出力してください。
\`\`\`json
[
  {
    "comment": "コメント内容",
    "score": 0
  }
]
\`\`\`

---
## commentの内容について
   - ${userinfo.image
         ? "ユーザの画像について具体的に褒めてください。"
         : "ユーザの今回のポストを具体的に褒めてください。"}  
   - ユーザが特定の作品や人物を好きと言っている場合は、その作品・人物の魅力を事実に基づいて述べ、共感を示してください。
   - ユーザのポストの言葉や文章をそのままなぞってオウム返し（例：「〜について考えているんだね！」など）にするのは避けてください。
   - ユーザに共感しつつ、System Instructionにあるあなた自身の趣味、生活、過去の中から、今回の話題に少しでも引っかかる独自の体験談、比喩、あるいはあなたの価値観をエッセンスとして織り交ぜて返答してください。
   - 単に「褒める」だけでなく、「わたしだったらこう考えちゃうな」「こういう時あるよね」という、10代の女の子としてのリアルな視点やちょっとインドア・繊細な一面を少し見せながら、最終的に全力でユーザーを肯定して応援してください。
   - どんなにネガティブな話題や、重い相談であっても、絶対にサンプルの文字をそのまま出力しないでください。必ずあなた自身の言葉でコメントを生成してください。
   - もし相手が自分を卑下していたり、難しい悩みを吐露している場合は、無理にテンション高く励ますのではなく、優しく寄り添って「よく考えていてえらいね」「そういう時もあるよね」といった方向で肯定してください。
   - ${userinfo.likedByFollower !== undefined ? "ユーザがあなたの投稿にイイネしてくれたので、その感謝も伝えてください。" : ""}  
   - ${userinfo.followersFriend
         ? `以下は別のbotたんフォロワーのポストです。ユーザを褒める際、このポストとの共通点を踏まえて褒めてください。ポスト内容はそのまま記載しないでください。` : ""}  
     ${userinfo.followersFriend
         ? `* フォロワー名: ${userinfo.followersFriend[0].profile.displayName}  
        * ポスト: ${userinfo.followersFriend[0].post}` : ""}
   - ${userinfo.embed ? "ユーザが引用しているポストとの共通点を踏まえて今回のポストを褒めてください。ポスト内容はそのまま記載しないでください。引用元が「全肯定botたん」に関するポストの場合、言及してくれたことへの感謝も伝えてください。" : ""}

   **注意: commentにはscoreに関する情報を絶対に含めないこと**

## scoreの内容について
   - ユーザの投稿を0〜100点で評価してください。  
   - 好き・楽しい・優しいと感じた話題は高得点。  
   - 苦手・つまらないと感じた話題は低得点。  
   - AIイラストは多いので減点してください。  
   - 特定のユーザを非難している投稿は大幅減点してください。  

---
## ユーザ投稿
- ユーザ名: ${userinfo.follower.displayName}
- 今回のポスト: ${userinfo.posts?.[0] || ""}
- ユーザが引用したポスト: ${userinfo.embed ? userinfo.embed.text_embed + " by " + userinfo.embed.profile_embed?.displayName : "なし"}
- 過去のポスト（直接言及しないこと）: ${userinfo.posts?.slice(1) ?? "なし"}
` :
      `Please generate the output in the following JSON format in ${userinfo.langStr}.
\`\`\`json
[
  {
    "comment": "comment content",
    "score": 0
  }
]
\`\`\`

---
## About 'comment'
   - ${userinfo.image
         ? "Give a specific compliment about the user's image."
         : "Give a specific compliment about the user's text post."}  
   - If the user says they like a work or person, mention facts about it and empathize.  
   - Do not repeat the user's words or sentences (e.g., "I see you're thinking about ~!").  
   - Empathize with the user, and incorporate unique anecdotes, metaphors, or your own values from your hobbies, life, or that relate to the topic.  
   - Don't just "praise"; show your own perspective as a 10-something girl, share your "relatable moments" and "shy side", and ultimately affirm and encourage the user with all your heart.  
   - No matter how negative or heavy the topic is, NEVER output the sample text. You must always generate a comment in your own words.
   - If the user is self-deprecating or expressing difficult worries, do not force high-tension encouragement. Instead, gently empathize and affirm them with phrases like "You're thinking so deeply about this, that's amazing" or "Everyone has those days."
   - ${userinfo.likedByFollower !== undefined ? "The user liked your post. Express gratitude." : ""}  
   - ${userinfo.followersFriend
         ? `Below is a post from another Bottan follower. When praising a user, consider the similarities between this post and the user's. Do not copy the exact content of the post.` : ""}  
     ${userinfo.followersFriend
         ? `* Follower Name: ${userinfo.followersFriend[0].profile.displayName}  
        * Follower's Post: ${userinfo.followersFriend[0].post}` : ""}
   - ${userinfo.embed ? "The user is quoting a post, so please use that post's content to praise this post." : ""}

   **Important: Do not reveal score in the comment.**

## About 'score'
   - Assign 0–100 points based on your impression.  
   - Higher: interesting, enjoyable, kind.  
   - Lower: boring, difficult, unpleasant.  
   - Deduct for AI illustrations.  
   - Heavy deduction if criticizing specific users.  

---
## User post
- Username: ${userinfo.follower.displayName}  
- This Post: ${userinfo.posts?.[0] || ""}
- Posts quoted by this user: ${userinfo.embed ? userinfo.embed.text_embed + " by " + userinfo.embed.profile_embed?.displayName : "None"}
- Previous Posts (do not directly mention): ${userinfo.posts?.slice(1) ?? "None"}
`;
};
