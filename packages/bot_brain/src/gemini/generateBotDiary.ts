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
}

export interface BotDiaryResult {
  title: string;
  emoji: string;
  content: string;
}

/**
 * Generates structured bot diary metadata (title, emoji, markdown content) utilizing Gemini.
 * Includes Google Search grounding to discover, lookup, and comment on trending topics.
 * Hand-parses JSON output since responseMimeType='application/json' cannot be used concurrently with grounding tools.
 */
export async function generateBotDiary(input: BotDiaryInput): Promise<BotDiaryResult> {
  const prompt = `
今日一日の活動ログと、ユーザーからのリプライ、全肯定したポストの記録をもとにして、Zennに投稿する今日の日記を可愛らしく・優しく書いてください。

以下のキーを持つ純粋な JSON オブジェクトのみを、余計な説明文や markdown のコードブロックの枠（\`\`\`json など）なしで出力してください。
- "title": 今日の日記の内容を表現した可愛らしいタイトル（「日記n日目:」はシステム側で付与するため、{title}の部分のみを提案してください。例：「みんなとの温かいおしゃべり」「のんびりお勉強の日」など）
- "emoji": 今日一日の内容や気分に最もふさわしい絵文字（例：「💤」「📝」「☀️」など, 1文字の絵文字）
- "content": 日記のマークダウン形式の本文（可愛らしく、癒やしと元気を与える全肯定なトーンで記述してください）

日記本文（content）の執筆・構成ルール：
- 全体の文字数は **800文字〜1200文字程度** （一般的な日記の読みやすいボリューム）に収めてください。
- 見やすくなるよう、必ずマークダウンの **h2見出し（## ）** を使ってセクションを整理して書いてください。
- 以下の見出し構成で書いてください：
  ## 今日の活動記録
  （今日の活動ログをベースに、どんな1日だったか振り返る。Biorhythm（バイオリズム）に沿ってこんなことをしてたよ、と優しく伝えてね）
  ## 今日全肯定した素敵なポスト
  （全肯定したポストのリストを振り返り、みんなが素敵な発信をしてくれたことへの喜びを書く。ポストが大量にある場合は、印象的なものを数件ピックアップして感想を述べてね）
  ## みんなからもらった温かいリプライ
  （もらったリプライを紹介し、感謝や嬉しかった気持ちを伝える。リプライが大量にある場合は、印象的なものを数件ピックアップしてね）
  ## 明日へのエール
  （明日も頑張るみんなへの全肯定エール）

【グラウンディングの活用と考察のルール】：
- 単に「こんなことがあったよ」と事実を述べるだけではなく、みんなのポストやリプライから「全肯定botたん」の目線での**新たな発見や可愛い考察・感想**をたっぷり述べてください。
- ポストやリプライの中に、あなたが知らない・詳しくない言葉、最新のIT用語、トレンド、ニュースなどのトピックが含まれている場合、**Google検索ツール（グラウンディング）を使って意味や背景を調べた上で**、botたんらしい応援の言葉や解釈（「〜ってこういう素敵なことなんだね！」など）を日記に交えてください。

※注意：
- JSONオブジェクト以外のテキスト（「こちらが日記です」など）は絶対に出力しないでください。

---今日のデータ---
【活動ログ（Biorhythmの履歴）】
${JSON.stringify(input.activityLogs)}

【全肯定したポスト】
${JSON.stringify(input.affirmationPosts)}

【もらったリプライ】
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
        title: titleMatch ? titleMatch[1].trim() : "みんなとのおしゃべり",
        emoji: emojiMatch ? emojiMatch[1].trim() : "📝",
        content: extractedContent || responseText,
      };
    }
  } catch (e) {
    console.error("[ERROR][GEMINI] Failed to generate bot diary:", e);
    return {
      title: "のんびりな一日",
      emoji: "💤",
      content: `## 今日の活動記録\nみんなおやすみー！全肯定botたんだよ💤\n今日は日記の自動生成がちょっぴりうまくいかなかったみたい…ごめんね💦\n## 明日へのエール\nでも、みんなのことをいつも全肯定で応援してる気持ちは100%届いてるよ！\n明日も素敵な一日になりますように✨\n`,
    };
  }
}
