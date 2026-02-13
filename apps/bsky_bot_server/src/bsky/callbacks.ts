import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyFeedPost } from "@atproto/api";
import { agent } from "./agent.js";
import { features } from "../features/index.js";
import { MemoryService } from "@bsky-affirmative-bot/clients";
import { followerMap, updateFollowers } from "./followerManagement.js";
import { logger, botBiothythmManager } from "../index.js";
import { isMention, isSpam, getLangStr, splitUri } from "./util.js";
import { follow } from "./follow.js";
import { replyGreets } from "./replyGreets.js";
import retry from 'async-retry';

export async function onPost(event: any) {
  const authorDid = event.did;
  const record = event.commit.record as AppBskyFeedPost.Record;
  const follower = followerMap.get(authorDid);
  if (!follower) return; // Only handle followers for most features

  try {
    await retry(
      async () => {
        // Self filter
        if (authorDid === process.env.BSKY_DID) return;

        // Spam filter
        const text = record.text || "";
        const donate_word = ["donate", "donation", "donating", "gofund.me", "paypal.me", "【AUTO】"];
        const isIncludedDonate = donate_word.some(elem =>
          text.toLowerCase().includes(elem.toLowerCase())
        );
        if (isIncludedDonate) return;

        // Note: parseEmbedPost and other checks could be added here if needed, 
        // but using current features architecture is preferred.

        const context = {};

        for (const feature of features) {
          try {
            if (await feature.shouldHandle(event, follower, context)) {
              console.log(`[INFO][${authorDid}] Feature matched: ${feature.name}`);
              await feature.handle(event, follower, context);
              await MemoryService.logUsage(feature.name, authorDid, { text });

              break;
            }
          } catch (e) {
            console.error(`[ERROR][${authorDid}] Feature ${feature.name} failed:`, e);
          }
        }
      },
      {
        retries: 3,
        onRetry: (err, attempt) => {
          console.warn(`[WARN][${authorDid}] Retry attempt ${attempt} for onPost:`, err);
        },
      }
    );
  } catch (e) {
    console.error(`[ERROR][${authorDid}] onPost failed unexpectedly:`, e);
  }
}

export async function onFollow(event: any) {
  const did = event.did;
  const record = event.commit.record as any;

  // Bot target filter
  if (record.subject !== process.env.BSKY_DID) return;

  console.log(`[INFO] New follow detected from ${did}`);

  // Optimistic update
  if (!followerMap.has(did)) {
    try {
      const { data: profile } = await agent.getProfile({ actor: did });
      followerMap.set(did, profile);
      console.log(`[INFO] ${did} added to follower map optimistically.`);
    } catch (e) {
      console.warn(`[WARN] Failed to fetch profile for ${did} optimistically.`);
    }
  }

  // Background full update
  updateFollowers().catch(e => console.error("[ERROR] Background follower update failed:", e));

  // Check if new user in DB
  const isExist = await MemoryService.getFollower(did);
  if (isExist && isExist.created_at) {
    console.log(`[INFO] ${did} is an existing user. Skipping follow-back.`);
    return;
  }

  console.log(`[INFO] New follower: ${did}! Executing follow-back and greeting.`);

  try {
    botBiothythmManager.addFollower(); // Boost energy on new follow
    await MemoryService.logUsage('follow', did);
    await follow(did);

    const response = await agent.getAuthorFeed({ actor: did, filter: 'posts_no_replies' });
    for (const feed of response.data.feed) {
      // Use util functions for consistency
      const postRecord = feed.post.record as AppBskyFeedPost.Record;
      if (isMention(postRecord) && !feed.reason && !isSpam(feed.post)) {
        const langStr = getLangStr(postRecord.langs);
        await replyGreets(feed.post, langStr);
        break;
      }
    }

    await MemoryService.ensureFollower(did);
  } catch (e) {
    console.error("[ERROR] Follow/Greet process failed:", e);
  }
}

export async function onLike(event: any) {
  const did = event.did;
  const record = event.commit.record as any;
  const { did: subjectDid, nsid, rkey } = splitUri(record.subject.uri);

  if (subjectDid !== process.env.BSKY_DID) return;

  try {
    await retry(async () => {
      const uri = record.subject.uri;
      const existingLike = await MemoryService.getLike(did);
      if (existingLike && existingLike.uri === uri) return;

      console.log(`[INFO] Detected like from: ${did}`);

      const response = await agent.com.atproto.repo.getRecord({
        repo: subjectDid,
        collection: nsid,
        rkey,
      });
      const text = (response.data.value as any).text;

      // Update BioRhythm and DB
      await botBiothythmManager.addLike();

      await MemoryService.upsertLike({ did, liked_post: text, uri });
      await MemoryService.logUsage('like', did, { uri, text });
    }, {
      retries: 3,
      onRetry: (err, attempt) => {
        console.warn(`[WARN][${did}] Retry attempt ${attempt} for onLike:`, err);
      }
    });
  } catch (e) {
    console.error(`[ERROR][${did}] onLike failed:`, e);
  }
}
