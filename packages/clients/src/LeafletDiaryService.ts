import { AtpAgent } from '@atproto/api';
import { generateBotDiary } from '@bsky-affirmative-bot/bot-brain';
import { fetchDiaryData } from './diaryUtils.js';
// Types derived from @atcute/leaflet (pub.leaflet lexicon)
type LeafletFacet = {
  index: { byteStart: number; byteEnd: number };
  features: Array<
    | { $type: 'pub.leaflet.richtext.facet#link'; uri: string }
    | { $type: 'pub.leaflet.richtext.facet#bold' }
    | { $type: 'pub.leaflet.richtext.facet#italic' }
    | { $type: 'pub.leaflet.richtext.facet#code' }
  >;
};
type LeafletBlockText = { $type: 'pub.leaflet.blocks.text'; plaintext: string; facets?: LeafletFacet[] };
type LeafletBlockHeader = { $type: 'pub.leaflet.blocks.header'; plaintext: string; level?: number; facets?: LeafletFacet[] };
type LeafletBlockHR = { $type: 'pub.leaflet.blocks.horizontalRule' };
type LeafletLinearBlock = { $type: 'pub.leaflet.pages.linearDocument#block'; block: LeafletBlockText | LeafletBlockHeader | LeafletBlockHR };

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

function parseInline(rawText: string): { plaintext: string; facets: LeafletFacet[] } {
  const facets: LeafletFacet[] = [];
  let plaintext = '';
  let i = 0;

  while (i < rawText.length) {
    // [text](url) link
    if (rawText[i] === '[') {
      const textEnd = rawText.indexOf(']', i + 1);
      if (textEnd !== -1 && rawText[textEnd + 1] === '(') {
        const urlEnd = rawText.indexOf(')', textEnd + 2);
        if (urlEnd !== -1) {
          const linkText = rawText.slice(i + 1, textEnd);
          const uri = rawText.slice(textEnd + 2, urlEnd);
          const byteStart = Buffer.byteLength(plaintext, 'utf8');
          plaintext += linkText;
          facets.push({
            index: { byteStart, byteEnd: Buffer.byteLength(plaintext, 'utf8') },
            features: [{ $type: 'pub.leaflet.richtext.facet#link', uri }],
          });
          i = urlEnd + 1;
          continue;
        }
      }
    }
    // **bold** → strip markers, keep text
    if (rawText[i] === '*' && rawText[i + 1] === '*') {
      const end = rawText.indexOf('**', i + 2);
      if (end !== -1) { plaintext += rawText.slice(i + 2, end); i = end + 2; continue; }
    }
    // *italic* or _italic_
    if (rawText[i] === '*' || rawText[i] === '_') {
      const marker = rawText[i];
      const end = rawText.indexOf(marker, i + 1);
      if (end !== -1) { plaintext += rawText.slice(i + 1, end); i = end + 1; continue; }
    }
    // `code`
    if (rawText[i] === '`') {
      const end = rawText.indexOf('`', i + 1);
      if (end !== -1) { plaintext += rawText.slice(i + 1, end); i = end + 1; continue; }
    }
    plaintext += rawText[i];
    i++;
  }

  return { plaintext, facets };
}

function markdownToBlocks(md: string): LeafletLinearBlock[] {
  const blocks: LeafletLinearBlock[] = [];
  const lines = md.split('\n');
  let paraLines: string[] = [];
  let inCodeFence = false;

  function flushParagraph() {
    const raw = paraLines.join('\n').trim();
    paraLines = [];
    if (!raw) return;
    const { plaintext, facets } = parseInline(raw);
    if (!plaintext) return;
    const block: LeafletBlockText = {
      $type: 'pub.leaflet.blocks.text',
      plaintext,
      ...(facets.length > 0 && { facets }),
    };
    blocks.push({ $type: 'pub.leaflet.pages.linearDocument#block', block });
  }

  for (const line of lines) {
    if (line.startsWith('```')) { inCodeFence = !inCodeFence; continue; }
    if (inCodeFence) { paraLines.push(line); continue; }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      flushParagraph();
      const { plaintext, facets } = parseInline(headingMatch[2]);
      const block: LeafletBlockHeader = {
        $type: 'pub.leaflet.blocks.header',
        level: headingMatch[1].length,
        plaintext,
        ...(facets.length > 0 && { facets }),
      };
      blocks.push({ $type: 'pub.leaflet.pages.linearDocument#block', block });
      continue;
    }

    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushParagraph();
      const block: LeafletBlockHR = { $type: 'pub.leaflet.blocks.horizontalRule' };
      blocks.push({ $type: 'pub.leaflet.pages.linearDocument#block', block });
      continue;
    }

    if (line.trim() === '') { flushParagraph(); continue; }

    paraLines.push(line.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, ''));
  }
  flushParagraph();

  return blocks;
}

export class LeafletDiaryService {
  static async generateAndPostDiary(agent: AtpAgent, diaryCount: number, lang: 'en' | 'ja' = 'en'): Promise<string | undefined> {
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

    const isJa = lang === 'ja';
    const locale = isJa ? 'ja-JP' : 'en-US';
    const langStr = isJa ? "日本語" : "English";
    const langLabel = isJa ? "Japanese" : "English";

    const { dateStr, sinceDate, activityLogs, affirmationPosts, receivedReplies } = await fetchDiaryData(locale);

    console.log(`[INFO][LEAFLET] Gathering logs since ${sinceDate.toISOString()} for ${dateStr} (${langLabel})...`);
    console.log(`[INFO][LEAFLET] Generating ${langLabel} markdown with Gemini for Diary Day ${diaryCount}...`);

    const diaryResult = await generateBotDiary({
      dateStr,
      diaryDayCount: diaryCount,
      activityLogs,
      affirmationPosts,
      receivedReplies,
      langStr,
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
    const titleWithDay = isJa
      ? `日記${diaryCount}日目: ${diaryResult.title}`
      : `Diary Day ${diaryCount}: ${diaryResult.title}`;
    const footer = isJa
      ? `\n\n---\n[全肯定botたんのBlueskyアカウントはこちら](https://bsky.app/profile/bot-tan.suibari.com)`
      : `\n\n---\n[Follow Affirmative Bot-tan on Bluesky!](https://bsky.app/profile/bot-tan.suibari.com)`;
    const markdownContent = `${diaryResult.content}${footer}`;

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
