import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyFeedPost, AtpAgent } from "@atproto/api";
import { agent } from "./agent.js";
import { features } from "../features/index.js";
import { MemoryService, botBiothythmManager } from "@bsky-affirmative-bot/clients";
import { followerMap, updateFollowers } from "./followerManagement.js";
import { isMention, getLangStr, splitUri, isIgnoreTarget, hasNGWord, isIgnorePost, isReplyOrMentionToMe } from "./util.js";
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

        // Label filter
        if (isIgnoreTarget(follower.labels)) {
          console.log(`[INFO][${authorDid}] Ignored due to author labels`);
          return;
        }

        // External & Self Label filter via AppView
        // 外部ラベラー（Official Moderation等）の反映を待つため少し待機
        await new Promise(resolve => setTimeout(resolve, 3000));
        const uri = `at://${authorDid}/${event.commit.collection}/${event.commit.rkey}`;
        const response = await agent.app.bsky.feed.getPosts({ uris: [uri] });
        const postView = response.data.posts[0];
        if (postView && isIgnorePost(postView)) {
           console.log(`[INFO][${authorDid}] Ignored due to post labels (fetched from AppView)`);
           return;
        }

        // Spam filter
        const text = record.text || "";
        if (hasNGWord(text)) {
          console.log(`[INFO][${authorDid}] Ignored due to NG word`);
          if (isReplyOrMentionToMe(record)) {
            console.log(`[INFO][${authorDid}] Saving NG word to replies table for blacklisting`);
            await MemoryService.upsertReply(authorDid, { reply: text, uri: uri, isRead: 0 });
          }
          return;
        }

        // Bot check
        if (await isBot(authorDid, agent)) {
          console.log(`[INFO][${authorDid}] Ignored as bot account`);
          return;
        }

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

  const profile = followerMap.get(did);
  if (profile && isIgnoreTarget(profile.labels)) {
    console.log(`[INFO] ${did} is ignored due to author labels. Skipping follow-back.`);
    return;
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
      if (isMention(postRecord) && !feed.reason && !isIgnorePost(feed.post) && !hasNGWord(postRecord.text)) {
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

async function isBot(did: string, agent: AtpAgent): Promise<boolean> {
  const response = await agent.getAuthorFeed({ actor: did, limit: 20 });
  let linkCount = 0;
  let hasReplyToOthers = false;

  for (const item of response.data.feed) {
    const record = item.post.record as any;
    
    // リンクチェック (facets または embed.external)
    const hasFacetLink = record.facets?.some((f: any) => 
      f.features?.some((feat: any) => feat.$type === 'app.bsky.richtext.facet#link')
    );
    const hasExternalLink = record.embed?.$type === 'app.bsky.embed.external' || !!record.embed?.external;
    
    if (hasFacetLink || hasExternalLink) {
      linkCount++;
    }

    // リプライチェック (自分以外へのリプライがあるか)
    if (record.reply) {
      const parentAuthorDid = splitUri(record.reply.parent.uri).did;
      if (parentAuthorDid !== did) {
        hasReplyToOthers = true;
      }
    }
  }

  const isDetected = linkCount >= 8 && !hasReplyToOthers;
  // if (isDetected) {
  //   console.log(`[INFO][${did}] Bot detected: ${linkCount} links found and no external replies in last 20 posts`);
  // }
  return isDetected;
}
