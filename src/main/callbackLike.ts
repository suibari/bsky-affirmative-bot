import { CommitCreateEvent } from "@skyware/jetstream";
import { botBiothythmManager } from "../biorhythm";
import { agent } from "../bsky/agent";
import { splitUri } from "../bsky/util";
import { dbLikes } from "../db";
import { Record as RecordPost } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { Record as RecordLike } from '@atproto/api/dist/client/types/app/bsky/feed/like.js';
import retry from 'async-retry';

export async function callbackLike (event: CommitCreateEvent<"app.bsky.feed.like">) {
  const did = String(event.did);
  const record = event.commit.record as RecordLike;
  const {did: subjectDid, nsid, rkey} = splitUri(record.subject.uri);

  try {
    retry(
      async () => {
        // 自分宛以外のlikeを除外
        if (subjectDid !== process.env.BSKY_DID) return;
          
        console.log(`[INFO] detect liked by: ${did}`);

        // likeされた元ポストの取得
        const response = await agent.com.atproto.repo.getRecord({
          repo: subjectDid,
          collection: nsid,
          rkey,
        });
        const text = (response.data.value as RecordPost).text;

        // BioRhythm操作
        botBiothythmManager.addLike();

        // DB格納
        dbLikes.insertDb(did);
        dbLikes.updateDb(did, "liked_post", text);
      },{
        retries: 3,
        onRetry: (err, attempt) => {
          console.warn(`[WARN][${event.did}] Retry attempt ${attempt} to saveLike:`, err);
        }
      }
    )
  } catch (e) {
    console.error(`[ERROR][${did}] like process failed: ${e}`);
  }
}
