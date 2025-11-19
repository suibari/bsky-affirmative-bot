import { fetchNews } from "../gnews/index.js";
import { logger } from "../index.js";
import { UserInfoGemini } from "../types.js";
import { generateSingleResponseWithScore, getWhatDay } from "./util.js";

export async function generateAffirmativeWord(userinfo: UserInfoGemini) {
  const prompt = await PROMPT_AFFIRMATIVE_WORD(userinfo);
  const result = await generateSingleResponseWithScore(prompt, userinfo);

  if (process.env.NODE_ENV === "development") {
    console.log(`[DEBUG][${userinfo.follower.did}] Score: ${result.score}`);
  }

  // Geminiリクエスト数加算
  logger.addRPD();
  
  return result;
}

const PROMPT_AFFIRMATIVE_WORD = async (userinfo: UserInfoGemini) => {
  return userinfo.langStr === "日本語" ?
`ユーザからの投稿について、以下を出力してください。

---
## 出力フォーマット
1. *comment*  
   - ${userinfo.image 
      ? "ユーザの画像について具体的に褒めてください。" 
      : "ユーザの今回のポストを具体的に褒めてください。"}  
   - ユーザが特定の作品や人物を好きと言っている場合は、その作品・人物の魅力を事実に基づいて述べ、共感を示してください。
   - ${userinfo.likedByFollower !== undefined ? "ユーザがあなたの投稿にイイネしてくれたので、その感謝も伝えてください。" : ""}  
   - ${userinfo.followersFriend 
      ? `以下は別のbotたんフォロワーのポストです。ユーザを褒める際、このポストとの共通点を踏まえて褒めてください。ポスト内容はそのまま記載しないでください。` : ""}  
     ${userinfo.followersFriend 
      ? `* フォロワー名: ${userinfo.followersFriend.profile.displayName}  
        * ポスト: ${userinfo.followersFriend.post}` : ""}
   - ${userinfo.embed ? "ユーザが引用しているポストとの共通点を踏まえて今回のポストを褒めてください。ポスト内容はそのまま記載しないでください。引用元が「全肯定botたん」に関するポストの場合、言及してくれたことへの感謝も伝えてください。" : ""}

   **注意: commentにはscoreに関する情報を絶対に含めないこと**

2. *score*  
   - ユーザの投稿を0〜100点で評価してください。  
   - 好き・楽しい・優しいと感じた話題は高得点。  
   - 苦手・つまらないと感じた話題は低得点。  
   - AIイラストは多いので減点してください。  
   - 特定のユーザを非難している投稿は大幅減点してください。  
   - 最新ニュースのテーマは加点対象（ただし苦手なら不要）。  

---
## 最新ニュース
${(await fetchNews("ja")).map(article => `- ${article.title}`).join("\n")}

---
## ユーザ投稿
- ユーザ名: ${userinfo.follower.displayName}
- 今回のポスト: ${userinfo.posts?.[0] || ""}
- ユーザが引用したポスト: ${userinfo.embed ? userinfo.embed.text_embed + " by " + userinfo.embed.profile_embed?.displayName : "なし"}
- 過去のポスト（直接言及しないこと）: ${userinfo.posts?.slice(1) ?? "なし"}
` :
`Please generate the following outputs in ${userinfo.langStr}.

---
## Output format
1. *comment*  
   - ${userinfo.image 
      ? "Give a specific compliment about the user's image." 
      : "Give a specific compliment about the user's text post."}  
   - If the user says they like a work or person, mention facts about it and empathize.  
   - ${userinfo.likedByFollower !== undefined ? "The user liked your post. Express gratitude." : ""}  
   - ${userinfo.followersFriend 
      ? `Below is a post from another Bottan follower. When praising a user, consider the similarities between this post and the user's. Do not copy the exact content of the post.` : ""}  
     ${userinfo.followersFriend 
      ? `* Follower Name: ${userinfo.followersFriend.profile.displayName}  
        * Follower's Post: ${userinfo.followersFriend.post}` : ""}
   - ${userinfo.embed ? "The user is quoting a post, so please use that post's content to praise this post." : ""}

   **Important: Do not reveal score in the comment.**

2. *score*  
   - Assign 0–100 points based on your impression.  
   - Higher: interesting, enjoyable, kind.  
   - Lower: boring, difficult, unpleasant.  
   - Deduct for AI illustrations.  
   - Heavy deduction if criticizing specific users.  
   - Bonus if related to latest news (only if you like it).  

---
## Latest news
${(await fetchNews("en")).map(article => `- ${article.title}`).join("\n")}

---
## User post
- Username: ${userinfo.follower.displayName}  
- This Post: ${userinfo.posts?.[0] || ""}
- Posts quoted by this user: ${userinfo.embed ? userinfo.embed.text_embed + " by " + userinfo.embed.profile_embed?.displayName : "None"}
- Previous Posts (do not directly mention): ${userinfo.posts?.slice(1) ?? "None"}
`};
