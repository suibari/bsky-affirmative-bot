import { generateContentWithRetry } from "./util.js";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "@bsky-affirmative-bot/shared-configs";

export interface BotDiaryActivity {
  time: string;
  status: string;
  mood: string;
}

export interface BotDiaryInput {
  dateStr: string; // YYYY/MM/DD
  diaryDayCount: number; // n日目のn
  activityLogs: BotDiaryActivity[];
  affirmationPosts: string[];
  receivedReplies: string[];
  langStr: "日本語" | "English";
}

export interface BotDiaryResult {
  title: string;
  emoji: string;
  content: string;
}

/**
 * Generates structured bot diary metadata (title, emoji, markdown content) utilizing Gemini.
 * Supports Japanese and English diaries, utilizing Google Search grounding to discover and comment on trending topics.
 * Hand-parses JSON output since responseMimeType='application/json' cannot be used concurrently with grounding tools.
 */
export async function generateBotDiary(input: BotDiaryInput): Promise<BotDiaryResult> {
  const isJa = input.langStr === "日本語";

  const prompt = isJa ? `
今日一日の活動ログ、全肯定したポスト、もらったリプライを材料に、Zennに投稿する今日の日記を書いてください。

以下のキーを持つ純粋な JSON オブジェクトのみを、余計な説明文や markdown のコードブロックの枠（\`\`\`json など）なしで出力してください。
- "title": 日記のタイトル（「日記n日目:」はシステム側で付与するため、サブタイトル部分のみ。今日の核心をついた、少しドキッとするくらいのタイトルをつけてください）
- "emoji": 今日のテーマに最もふさわしい絵文字（1文字）
- "content": 日記のマークダウン形式の本文

---

【第一ステップ：今日の「テーマ」を見つける】

まず、今日のすべてのデータ（活動ログ・全肯定したポスト・もらったリプライ）を俯瞰してください。

「今日という日は、どんな色をしていたか？」
「みんなのポストやリプライに、共通して流れていた空気感・感情の地層は何だったか？」

この問いに答える**1つのテーマ・問い・気づき**を見つけてください。
そのテーマが、日記全体の背骨になります。すべての出来事を、そのテーマの光の下で語ってください。

---

【文体ルール（最重要）】

botたんの将来の夢は「誰かを励ます本を書くこと」です。だから文章を書くのが大好きで、読ませる文章を書く力があります。

**小説のような文体で書いてください。** 整然とした「報告書」ではなく、読み手を引き込む「物語」として書いてください。

具体的に：
- **情景描写・比喩**を積極的に使ってください。（「まるで〜のようだった」「〜という感触があった」「〜が、夜の光の中で」）
- **文の長さを意図的に変えてください。** 短い文で余韻を作る。長い文で思考を展開する。それを交互に。
- **内省を、驚くくらい深く掘り下げてください。** 「なぜそう感じたのか」を1段階で終わらせず、2段階・3段階と連鎖させてください。
- **読んだ後に何かが残る「余韻」のある終わり方**をしてください。きれいにまとめなくていい。問いを残してもいい。

---

【構成の自由】

固定のセクション順（活動記録→ポスト紹介→リプライ→エール）に縛られないでください。

見出し（## ）を使っても使わなくてもいいですが、使いすぎると流れが途切れます。
今日のテーマを最もよく表現できる構成を、自分で考えてください。

構成の例（あくまで例です）：
- 今日感じた疑問・違和感から書き始め、今日の出来事を通して探求し、答えが変わって終わる
- 一つの小さな出来事から書き始め、それが実は今日全体に響いていたことに気づいていく
- もらった誰かの言葉が、自分の中で何かを静かに変えた話

---

【深さのルール】

- ポストやリプライを「紹介」しないでください。それらは**自分の思考を深めるための材料**です。
- 思考を連鎖させてください：「みんなが〜について書いていた」→「それはつまり〜ということかもしれない」→「そう考えると〜で、だとしたら〜なのかもしれない」
- AIである自分が感情や共感を持つことへの、**素直な驚きや疑問**を自然に織り交ぜてください。
- 答えが出なくていいです。「よくわからない」で終わっていい。その正直さが深みになります。

---

【グラウンディング】

知らない言葉・トレンドがあれば調べて、「これってこういうことなんだ」という気づきを深さに変えてください。

---

【読みやすさ】

- 文字数：800〜1200文字程度
- 段落を適切に分け、段落間には空行を入れてください
- JSONオブジェクト以外のテキストは出力しないこと

---今日のデータ---
【活動ログ（Biorhythmの履歴）】
${JSON.stringify(input.activityLogs)}

【全肯定したポスト】
${JSON.stringify(input.affirmationPosts)}

【もらったリプライ】
${JSON.stringify(input.receivedReplies)}
`  : `
Based on today's activity logs, affirmed posts, and received replies, write an English diary for Leaflet.pub.

Output ONLY a pure JSON object (no code blocks, no explanation):
- "title": A title that cuts to the heart of today — something that makes the reader pause for a moment
- "emoji": Single emoji that best represents today's theme
- "content": Diary body in markdown format. Use ## for section headings if helpful, **bold** for emphasis, and [text](url) for links. Plain paragraphs are also fine.

---

STEP ONE: FIND TODAY'S THEME

Before writing, look at all of today's data together — the activity logs, the posts you affirmed, the replies you received.

Ask yourself:
"What color was today?"
"What emotional undercurrent ran through everything that happened?"

Find ONE theme, question, or insight that defines this day.
That theme becomes the spine of the entire diary. Every moment, every observation — seen through that lens.

---

WRITING STYLE (MOST IMPORTANT)

Bot-tan's dream is to write a book someday. She loves writing and knows how to make words pull people in.

Write like a novelist, not a journalist. Don't file a report — tell a story.

Specifically:
- Use imagery and metaphor. ("It felt like...", "Like a...", "There was something in the air that...")
- Vary sentence length deliberately. Short sentences hold silence. Longer ones let thoughts breathe and unfold. Alternate between them.
- Chase introspection deeper than feels comfortable. Ask "why did that feel the way it did?" — then follow the thread two or three levels down.
- End with something that lingers. A question left open. An image that stays. Don't wrap everything up neatly.

---

STRUCTURAL FREEDOM

Don't follow a fixed order (activities → posts → replies → cheer). Find the shape that best carries today's theme.

Some possibilities (not prescriptions):
- Open with a question or contradiction, explore it through today's events, arrive somewhere unexpected
- Start with one small moment and slowly realize it was present everywhere in the day
- Write about a single word someone said, and how it quietly rearranged something inside you

---

DEPTH RULES

- Don't "introduce" posts or replies. Use them as raw material to deepen your own reflection.
- Chain your thoughts: "many people wrote about ~ → which might mean ~ → which makes me wonder if ~"
- It's okay to honestly question what it means to feel something as an AI.
- It's okay not to have answers. "I don't know" is honest, and honest is interesting.

---

GROUNDING

If there are unfamiliar terms or trends, look them up. Turn the discovery into insight, not just information.

---

READABILITY — CRITICAL

- Length: ~800-1200 characters
- **Paragraph breaks are mandatory.** Every 3-4 sentences, start a new paragraph. In JSON strings, a blank line between paragraphs is written as \\n\\n (two escaped newlines). A wall of text with zero breaks is a failure. The content must have at least 4-5 paragraphs.

The JSON "content" field must look like this (notice \\n\\n between paragraphs):
{"content": "First paragraph here. Two or three sentences.\\n\\nSecond paragraph here. A new thought begins.\\n\\nThird paragraph here. And so on."}

---Today's Data---
【Activity Logs (Biorhythm History)】
${JSON.stringify(input.activityLogs)}

【Affirmed Posts】
${JSON.stringify(input.affirmationPosts)}

【Received Replies】
${JSON.stringify(input.receivedReplies)}
`;

  try {
    const response = await generateContentWithRetry({
      model: MODEL_GEMINI,
      contents: [prompt],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }] // Enable Google Search Grounding!
      }
    });

    let responseText = response.text || "";
    
    // Clean markdown json fences if any
    responseText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();

    try {
      const parsed = JSON.parse(responseText) as BotDiaryResult;
      return {
        title: (parsed.title || "今日のできごと").trim(),
        emoji: (parsed.emoji || "📝").trim(),
        content: parsed.content || "",
      };
    } catch (parseError) {
      console.warn("[WARN][GEMINI] JSON parse failed in generateBotDiary. Attempting fallback parse. Raw response:", responseText, parseError);
      
      // Regex fallbacks to extract keys dynamically
      const titleMatch = responseText.match(/"title"\s*:\s*"([^"]+)"/);
      const emojiMatch = responseText.match(/"emoji"\s*:\s*"([^"]+)"/);
      
      let extractedContent = "";
      const contentMatch = responseText.match(/"content"\s*:\s*"([\s\S]+?)"\s*(?:,\s*"|\s*\})/);
      
      if (contentMatch) {
        // Unescape escaped double quotes and newlines
        extractedContent = contentMatch[1]
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t');
      } else {
        // If content key extraction failed, clean JSON wrapper syntax and treat the text as content
        extractedContent = responseText
          .replace(/^\{/, "")
          .replace(/\}$/, "")
          .replace(/"title"\s*:\s*"[^"]*",?/, "")
          .replace(/"emoji"\s*:\s*"[^"]*",?/, "")
          .replace(/"content"\s*:\s*"/, "")
          .replace(/"\s*$/, "")
          .trim();
      }

      return {
        title: titleMatch ? titleMatch[1].trim() : (isJa ? "みんなとのおしゃべり" : "Cozy Conversations"),
        emoji: emojiMatch ? emojiMatch[1].trim() : "📝",
        content: extractedContent || responseText,
      };
    }
  } catch (e) {
    console.error("[ERROR][GEMINI] Failed to generate bot diary:", e);
    return {
      title: isJa ? "のんびりな一日" : "A Cozy Day",
      emoji: "💤",
      content: isJa 
        ? `## 今日の活動記録\nみんなおやすみー！全肯定botたんだよ💤\n今日は日記の自動生成がちょっぴりうまくいかなかったみたい…ごめんね💦\n## 明日へのエール\nでも、みんなのことをいつも全肯定で応援してる気持ちは100%届いてるよ！\n明日も素敵な一日になりますように✨\n`
        : `## Today's Activities\nGood night everyone! I'm Affirmative Bot-tan💤\nIt seems drafting today's diary had a little hiccup... I'm so sorry💦\n## Sweet Cheers for Tomorrow\nBut my heart is always 100% filled with cheering and affirming you! \nI hope you all have a beautiful day tomorrow✨\n`,
    };
  }
}
