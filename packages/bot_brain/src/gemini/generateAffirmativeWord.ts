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
   const postText = userinfo.posts?.[0] || "";
   const postLength = postText.length;
   const lengthLimitJa = postLength === 0
      ? "300文字以内"
      : `${postLength}文字以上、${postLength * 2}文字以内`;
   const lengthLimitEn = postLength === 0
      ? "within 300 characters"
      : `between ${postLength} and ${postLength * 2} characters`;

   let styleJa = "";
   let styleEn = "";
   if (postLength === 0) {
      // 画像のみなど
      styleJa = "300文字以内の一般的な長さで返答してください。";
      styleEn = "Respond within 300 characters.";
   } else if (postLength <= 30) {
      // 短文（30文字以内）
      styleJa = "ユーザーのポストが短いため、必ず1文〜2文程度の一言（50文字以内）で、簡潔かつテンポよく短く返答してください。長文は厳禁です。";
      styleEn = "Since the user's post is short, keep your response brief and concise (within 50 characters, 1-2 sentences). Absolutely avoid a long reply.";
   } else if (postLength <= 200) {
      // 中文（30〜200文字）
      styleJa = `ユーザーのポストの長さに合わせて、あなたも「${postLength * 2}文字以内」の範囲でバランスをとって返答してください。`;
      styleEn = `Match the length of the user's post, keeping your response within ${postLength * 2} characters.`;
   } else {
      // 長文（200文字以上）
      styleJa = "ユーザーのポストが長文のため、あなたも「400〜600文字程度」のたっぷりとした長文で、熱量高く語るように返答してください。";
      styleEn = "Since the user's post is a long text, respond with a substantial and comprehensive long text (around 400 to 600 characters) to match their energy.";
   }

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
   - **文量スタイル**: ${styleJa}
   - **注意: JSONのパースエラーを防ぐため、commentの値（文字列）の中では二重引用符（"）を絶対に使用しないでください。代わりに、一重引用符（'）や「」などの記号を使用してください。**
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
    - ${userinfo.embed?.text_embed ? "ユーザが引用しているポストとの共通点を踏まえて今回のポストを褒めてください。ポスト内容はそのまま記載しないでください。引用元が「全肯定botたん」に関するポストの場合、言及してくれたことへの感謝も伝えてください。" : ""}
    - ${userinfo.embed?.uri_embed ? "ユーザが共有しているリンク先の内容について、URLコンテキスト機能を必ず使用して実際のページ内容を確認し、その具体的な中身（記事のテーマや主張など）に触れた上で、ユーザの感性や興味を具体的に褒めてください。" : ""}

   **注意: commentにはscoreに関する情報を絶対に含めないこと**

## scoreの内容について
   - ユーザの投稿を0〜100点で評価してください。厳格に評価の希少性を持たせるために、以下の分布を意識してかなり厳しめに採点してください。
   - **採点基準（希少性の確保）**:
     - **70点〜85点**: 通常の親切なポスト、明るい話題、または日常的な楽しい出来事。これが標準（基本）の評価帯です。
     - **86点〜94点**: 非常に優しさに満ちている、または強い前向きさや努力が感じられる素晴らしいポスト。
     - **95点〜99点**: 滅多に遭遇しない「極めて特別な全肯定の最高峰」に達するような、深く心を揺さぶられる感動的なポスト。非常に希少な得点として厳しく制限してください。
     - **100点**: 奇跡的な完璧さ、極限の優しさや感動を放つ特別なポスト（めったに出さないこと）。
     - **70点未満**: 愚痴、ネガティブな話題、AIイラスト、あるいは特定のユーザへの非難（大幅減点）など。
   - AIイラストは多いので減点してください。  
   - 特定のユーザを非難している投稿は大幅減点してください。  

---
## ユーザ投稿
- ユーザ名: ${userinfo.follower.displayName}
- 今回のポスト: ${postText}
- ユーザが引用したポスト: ${userinfo.embed?.text_embed ? userinfo.embed.text_embed + " by " + userinfo.embed.profile_embed?.displayName : "なし"}
- ユーザが共有したリンク: ${userinfo.embed?.uri_embed ? `${userinfo.embed.title_embed} (${userinfo.embed.uri_embed}) ${userinfo.embed.description_embed || ""}` : "なし"}
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
   - **STYLE CONSTRAINT**: ${styleEn}
   - **CRITICAL: To prevent JSON parsing errors, NEVER use double quotes (") inside the "comment" value. Use single quotes (') or other punctuation marks instead.**
   - **CRITICAL: You MUST write the "comment" value entirely in ${userinfo.langStr}. DO NOT use Japanese.**
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
    - ${userinfo.embed?.text_embed ? "The user is quoting a post, so please use that post's content to praise this post." : ""}
    - ${userinfo.embed?.uri_embed ? "Be sure to use the URL context feature to check the actual content of the shared link, and specifically praise the user's interest or perspective by referring to the specific theme or content of the link." : ""}

   **Important: Do not reveal score in the comment.**

## About 'score'
   - Assign 0–100 points based on your impression. To maintain strict scarcity, apply a strict distribution:
   - **Scoring Rubric (Strict Scarcity)**:
     - **70 to 85**: Standard pleasant, positive, or daily fun posts. This is the baseline.
     - **86 to 94**: Exceptionally kind, highly positive, or effort-driven outstanding posts.
     - **95 to 99**: Extremely rare "pinnacle of affirmation" posts that are deeply moving. Strictly limit this score range.
     - **100**: Miracle posts with absolute perfection in kindness or inspiration (highly restricted).
     - **Below 70**: Complaining, negative topics, AI illustrations, or criticizing specific users (heavy deduction).
   - Deduct for AI illustrations.  
   - Heavy deduction if criticizing specific users.  

---
## User post
- Username: ${userinfo.follower.displayName}  
- This Post: ${postText}
- Posts quoted by this user: ${userinfo.embed?.text_embed ? userinfo.embed.text_embed + " by " + userinfo.embed.profile_embed?.displayName : "None"}
- Links shared by this user: ${userinfo.embed?.uri_embed ? `${userinfo.embed.title_embed} (${userinfo.embed.uri_embed}) ${userinfo.embed.description_embed || ""}` : "None"}
- Previous Posts (do not directly mention): ${userinfo.posts?.slice(1) ?? "None"}
`;
};
