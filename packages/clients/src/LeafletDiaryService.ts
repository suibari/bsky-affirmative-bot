import { AtpAgent } from '@atproto/api';
import { generateBotDiary } from '@bsky-affirmative-bot/bot-brain';
import { fetchDiaryData } from './diaryUtils.js';

function generateRkey(): string {
  const alphabet = '234567abcdefghijklmnopqrstuvwxyz';
  // AT Protocol TID: 10-char timestamp (microseconds, base32 big-endian) + 3-char clock ID
  let ts = BigInt(Date.now()) * 1000n;
  let rkey = '';
  for (let i = 0; i < 10; i++) {
    rkey = alphabet[Number(ts % 32n)] + rkey;
    ts /= 32n;
  }
  for (let i = 0; i < 3; i++) {
    rkey += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rkey;
}

function markdownToBlocks(md: string) {
  return md.split('\n\n').filter(Boolean).map(paragraph => ({
    $type: "pub.leaflet.pages.linearDocument#block",
    block: {
      $type: "pub.leaflet.blocks.text",
      plaintext: paragraph
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[*`_]/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .trim(),
      facets: [],
    },
  }));
}

export class LeafletDiaryService {
  static async generateAndPostDiary(agent: AtpAgent, diaryCount: number): Promise<string | undefined> {
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

    const { dateStr, sinceDate, activityLogs, affirmationPosts, receivedReplies } = await fetchDiaryData('en-US');

    console.log(`[INFO][LEAFLET] Gathering logs since ${sinceDate.toISOString()} for ${dateStr} (English)...`);
    console.log(`[INFO][LEAFLET] Generating English markdown with Gemini for Diary Day ${diaryCount}...`);

    const diaryResult = await generateBotDiary({
      dateStr,
      diaryDayCount: diaryCount,
      activityLogs,
      affirmationPosts,
      receivedReplies,
      langStr: "English",
    });

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
    const titleWithDay = `Diary Day ${diaryCount}: ${diaryResult.title}`;
    const markdownContent = `${diaryResult.content}\n\n---\n[Follow Affirmative Bot-tan on Bluesky!](https://bsky.app/profile/bot-tan.suibari.com)`;

    const record = {
      $type: "pub.leaflet.document",
      title: titleWithDay,
      author: botDid,
      description: diaryResult.title,
      publication: publicationUri,
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
      await agent.api.com.atproto.repo.createRecord({
        repo: botDid,
        collection: "pub.leaflet.document",
        rkey: rkey,
        record: record,
      });

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
