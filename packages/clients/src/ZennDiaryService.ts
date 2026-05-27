import axios from 'axios';
import { MemoryService } from '@bsky-affirmative-bot/database';
import { generateBotDiary, BotDiaryActivity } from '@bsky-affirmative-bot/bot-brain';

export class ZennDiaryService {
  /**
   * Aggregates today's bot activities, affirmations, and replies,
   * generates a Markdown diary using Gemini, and pushes it directly to the Zenn GitHub repository.
   * @returns The expected Zenn article URL, or undefined if configuration is missing.
   */
  static async generateAndPostDiary(): Promise<string | undefined> {
    const pat = process.env.GITHUB_PAT;
    const repo = process.env.GITHUB_DIARY_REPO;
    const zennUser = process.env.ZENN_USERNAME;

    if (!pat || !repo || !zennUser) {
      console.warn("[WARN][DIARY] GITHUB_PAT, GITHUB_DIARY_REPO, or ZENN_USERNAME is not set in environment.");
      return undefined;
    }

    // Determine "today's" boundary: from 4:00 AM of today (or yesterday if currently 0:00 - 3:59 AM) to now.
    const now = new Date();
    const sinceDate = new Date(now);
    if (now.getHours() < 4) {
      sinceDate.setDate(sinceDate.getDate() - 1);
    }
    sinceDate.setHours(4, 0, 0, 0);

    const year = sinceDate.getFullYear();
    const month = String(sinceDate.getMonth() + 1).padStart(2, '0');
    const day = String(sinceDate.getDate()).padStart(2, '0');
    const dateStr = `${year}/${month}/${day}`;
    const slugDate = `${year}-${month}-${day}`;
    const slug = `diary-${slugDate}`;
    const path = `articles/${slug}.md`;

    console.log(`[INFO][DIARY] Gathering logs since ${sinceDate.toISOString()} for ${dateStr}...`);

    // 1. Fetch Biorhythm activity logs
    let rawActivities: any[] = [];
    try {
      rawActivities = await MemoryService.getBiorhythmHistorySince(sinceDate);
    } catch (err) {
      console.error("[ERROR][DIARY] Failed to fetch Biorhythm history:", err);
    }

    const activityLogs: BotDiaryActivity[] = rawActivities.map(a => {
      let timeStr = "";
      try {
        timeStr = new Date(a.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      } catch {
        timeStr = String(a.created_at);
      }
      return {
        time: timeStr,
        status: a.status,
        mood: a.mood,
      };
    });

    // 2. Fetch User Interactions
    let rawInteractions: any[] = [];
    try {
      rawInteractions = await MemoryService.getInteractionsSince(sinceDate);
    } catch (err) {
      console.error("[ERROR][DIARY] Failed to fetch Interactions:", err);
    }

    // Extract what posts the bot affirmed today
    const affirmationPosts = rawInteractions
      .filter(i => i.type === "NormalReply")
      .map(i => i.details?.text)
      .filter(Boolean) as string[];

    // Extract replies/mentions the bot received from users
    const receivedReplies = rawInteractions
      .filter(i => ["Conversation", "Fortune", "Cheer", "DJ", "Analyze", "Anniversary"].includes(i.type))
      .map(i => i.details?.text)
      .filter(Boolean) as string[];

    // ポスト・リプライが多かった場合に備えて、最新の最大10件にスライス（プロンプト肥大化と日記の長文化を防ぎます）
    const slicedAffirmations = affirmationPosts.slice(-10);
    const slicedReplies = receivedReplies.slice(-10);

    // 3. Fetch and increment the bot diary day count
    let diaryCount = 0;
    try {
      diaryCount = await MemoryService.getBotState("diary_count") || 0;
      diaryCount++;
      await MemoryService.setBotState("diary_count", diaryCount);
    } catch (err) {
      console.error("[ERROR][DIARY] Failed to manage diary_count:", err);
      diaryCount = 1;
    }

    console.log(`[INFO][DIARY] Generating markdown with Gemini for Diary Day ${diaryCount}...`);

    // 4. Call Gemini to draft the bot diary metadata (Structured Outputs)
    const diaryResult = await generateBotDiary({
      dateStr,
      diaryDayCount: diaryCount,
      activityLogs: activityLogs.slice(-15), // 活動ログも直近の最大15件にスライスして肥大化を防ぎます
      affirmationPosts: slicedAffirmations,
      receivedReplies: slicedReplies,
    });

    // 5. Construct Zenn Markdown content with robust Frontmatter and the footer Bluesky link
    const titleWithDay = `日記${diaryCount}日目: ${diaryResult.title}`;
    const markdownContent = `---
title: "${titleWithDay}"
emoji: "${diaryResult.emoji}"
type: "idea"
topics: ["bluesky", "bot", "日記"]
published: true
---
${diaryResult.content}

---
[全肯定botたんのBlueskyアカウントはこちら](https://bsky.app/profile/bot-tan.suibari.com)
`;

    const branch = process.env.GITHUB_DIARY_BRANCH;

    console.log(`[INFO][DIARY] Posting to GitHub repository ${repo}${branch ? ` (branch: ${branch})` : ''}...`);

    // 6. Push directly to GitHub via API
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    const base64Content = Buffer.from(markdownContent).toString('base64');

    try {
      const requestBody: any = {
        message: `feat: add diary for ${slugDate}`,
        content: base64Content,
      };

      if (branch) {
        requestBody.branch = branch;
      }

      await axios.put(url, requestBody, {
        headers: {
          Authorization: `token ${pat}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        }
      });

      console.log(`[INFO][DIARY] Successfully posted diary to GitHub path: ${path}`);
      return `https://zenn.dev/${zennUser}/articles/${slug}`;
    } catch (e: any) {
      console.error("[ERROR][DIARY] Failed to push diary to GitHub API:", e.response?.data || e.message);
      throw e;
    }
  }
}
