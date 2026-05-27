import { AtpAgent } from '@atproto/api';
import { MemoryService } from '@bsky-affirmative-bot/database';
import { generateBotDiary, BotDiaryActivity } from '@bsky-affirmative-bot/bot-brain';

function generateRkey(): string {
  // AT Protocol TID-like base32 string (13 chars)
  const alphabet = '234567abcdefghijklmnopqrstuvwxyz';
  let rkey = '';
  for (let i = 0; i < 13; i++) {
    rkey += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return rkey;
}

function markdownToBlocks(md: string) {
  return md.split('\n\n').filter(Boolean).map(paragraph => ({
    $type: "pub.leaflet.pages.linearDocument#block",
    block: {
      $type: "pub.leaflet.blocks.text",
      plaintext: paragraph
        .replace(/^#{1,6}\s+/gm, '') // Strip heading hashes
        .replace(/[*`_]/g, '')       // Strip bold/italic/code markers
        .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Strip markdown links to plain text
        .trim(),
      facets: [],
    },
  }));
}

export class LeafletDiaryService {
  /**
   * Aggregates today's bot activities, affirmations, and replies,
   * generates an English Markdown diary using Gemini, and publishes it directly to Leaflet.pub (via AT Protocol).
   * @param agent The logged-in AtpAgent instance.
   * @returns The expected Leaflet.pub article URL, or undefined if configuration is missing.
   */
  static async generateAndPostDiary(agent: AtpAgent): Promise<string | undefined> {
    const leafletUser = process.env.LEAFLET_USERNAME;
    const botDid = agent.session?.did;

    if (!leafletUser) {
      console.warn("[WARN][LEAFLET] LEAFLET_USERNAME is not set in environment.");
      return undefined;
    }

    if (!botDid) {
      console.warn("[WARN][LEAFLET] AtpAgent is not authenticated. Session DID is missing.");
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

    console.log(`[INFO][LEAFLET] Gathering logs since ${sinceDate.toISOString()} for ${dateStr} (English)...`);

    // 1. Fetch Biorhythm activity logs
    let rawActivities: any[] = [];
    try {
      rawActivities = await MemoryService.getBiorhythmHistorySince(sinceDate);
    } catch (err) {
      console.error("[ERROR][LEAFLET] Failed to fetch Biorhythm history:", err);
    }

    const activityLogs: BotDiaryActivity[] = rawActivities.map(a => {
      let timeStr = "";
      try {
        timeStr = new Date(a.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
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
      console.error("[ERROR][LEAFLET] Failed to fetch Interactions:", err);
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

    // 3. Fetch and increment the bot diary day count (shares same counter as Zenn for consistency)
    let diaryCount = 0;
    try {
      diaryCount = await MemoryService.getBotState("diary_count") || 0;
      // Note: We don't increment it again if Zenn has already incremented it, 
      // but because the good-night post runs both sequentially, we can just read the current diary_count.
      // If diary_count was not yet read, we fallback to 1.
      if (diaryCount === 0) {
        diaryCount = 1;
      }
    } catch (err) {
      console.error("[ERROR][LEAFLET] Failed to retrieve diary_count:", err);
      diaryCount = 1;
    }

    console.log(`[INFO][LEAFLET] Generating English markdown with Gemini for Diary Day ${diaryCount}...`);

    // 4. Call Gemini to draft the bot diary metadata (English)
    const diaryResult = await generateBotDiary({
      dateStr,
      diaryDayCount: diaryCount,
      activityLogs,
      affirmationPosts,
      receivedReplies,
      langStr: "English",
    });

    // 4.5. Fetch pub.leaflet.publication dynamically to associate the document correctly
    let publicationUri: string | undefined = undefined;
    let publicationBaseUrl: string | undefined = undefined;

    try {
      console.log(`[INFO][LEAFLET] Fetching pub.leaflet.publication record for DID: ${botDid}...`);
      const pubResponse = await agent.api.com.atproto.repo.listRecords({
        repo: botDid,
        collection: "pub.leaflet.publication",
        limit: 1,
      });

      if (pubResponse.data.records && pubResponse.data.records.length > 0) {
        const pubRecord = pubResponse.data.records[0];
        publicationUri = pubRecord.uri;
        publicationBaseUrl = (pubRecord.value as any)?.url;
        console.log(`[INFO][LEAFLET] Found parent publication: ${publicationUri} (URL: ${publicationBaseUrl})`);
      } else {
        console.warn("[WARN][LEAFLET] No pub.leaflet.publication record found on PDS. Leaflet.pub indexing might fail.");
      }
    } catch (err: any) {
      console.error("[ERROR][LEAFLET] Failed to list pub.leaflet.publication records:", err.message);
    }

    const rkey = generateRkey();

    // 5. Construct the document record according to pub.leaflet.document schema
    const titleWithDay = `Diary Day ${diaryCount}: ${diaryResult.title}`;
    const markdownContent = `${diaryResult.content}\n\n---\n[Follow Affirmative Bot-tan on Bluesky!](https://bsky.app/profile/bot-tan.suibari.com)`;

    const record = {
      $type: "pub.leaflet.document",
      title: titleWithDay,
      author: botDid,
      description: diaryResult.title, // 1-line summary
      publication: publicationUri,    // at://did:.../pub.leaflet.publication/xxxx
      publishedAt: new Date().toISOString(),
      pages: [
        {
          $type: "pub.leaflet.pages.linearDocument",
          blocks: markdownToBlocks(markdownContent),
        }
      ],
    };

    console.log(`[INFO][LEAFLET] Publishing pub.leaflet.document record to PDS with rkey: ${rkey}...`);

    try {
      const response = await agent.api.com.atproto.repo.createRecord({
        repo: botDid,
        collection: "pub.leaflet.document",
        rkey: rkey,
        record: record,
      });

      // Build public URL dynamically
      let leafletUrl = `https://leaflet.pub/p/${leafletUser}/${rkey}`;
      if (publicationBaseUrl) {
        const base = publicationBaseUrl.endsWith('/') ? publicationBaseUrl.slice(0, -1) : publicationBaseUrl;
        leafletUrl = `${base}/${rkey}`;
      } else if (leafletUser && !leafletUser.includes('.')) {
        leafletUrl = `https://leaflet.pub/p/${leafletUser}/${rkey}`;
      }

      console.log(`[INFO][LEAFLET] Successfully published diary to Leaflet.pub: ${leafletUrl}`);
      return leafletUrl;
    } catch (e: any) {
      console.error("[ERROR][LEAFLET] Failed to create pub.leaflet.document record on PDS:", e.message);
      throw e;
    }
  }
}
