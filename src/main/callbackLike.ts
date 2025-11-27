import { CommitCreateEvent } from "@skyware/jetstream";
import { agent } from "../bsky/agent";
import { splitUri } from "../bsky/util";
import { dbLikes } from "../db";
import { Record as RecordPost } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { Record as RecordLike } from '@atproto/api/dist/client/types/app/bsky/feed/like.js';
import retry from 'async-retry';
import { logger, botBiothythmManager } from "..";

export async function callbackLike (event: CommitCreateEvent<"app.bsky.feed.like">) {
  const did = String(event.did);
  const record = event.commit.record as RecordLike;
  const {did: subjectDid, nsid, rkey} = splitUri(record.subject.uri);

  try {
    retry(
      async () => {
        // 自分宛以外のlikeを除外
        if (subjectDid !== process.env.BSKY_DID) return;

        // 既にDBに存在するlikeを除外
        // NOTE: 過去全てのいいねを保持しているわけではないので、あるポストに対しての連続イイネしか防げない
        const uri = record.subject.uri;
        if (await dbLikes.selectDb(did, "uri") == uri) return;
          
        console.log(`[INFO] detect liked by: ${did}`);

        // likeされた元ポストの取得
        const response = await agent.com.atproto.repo.getRecord({
          repo: subjectDid,
          collection: nsid,
          rkey,
        });
        const text = (response.data.value as RecordPost).text;

        // BioRhythm操作
        logger.addLike();
        botBiothythmManager.addLike();

        // DB格納
        dbLikes.insertOrUpdateDb(did);
        dbLikes.updateDb(did, "liked_post", text);
        dbLikes.updateDb(did, "uri", uri);
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
