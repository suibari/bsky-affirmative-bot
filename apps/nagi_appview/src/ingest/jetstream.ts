import { Jetstream } from "@skyware/jetstream";
import ws from "ws";
import { db, nagiIngestState } from "@bsky-affirmative-bot/database";
import { NAGI_INGEST_COLLECTIONS } from "@bsky-affirmative-bot/nagi-lexicon";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { withDidLock } from "./didLock.js";
import { processEvent } from "./processEvent.js";
import { prioritizeReconcile } from "./reconcileWorker.js";
import { SerialRetryQueue } from "./serialQueue.js";

export async function startJetstream() {
  const saved = await db
    .select()
    .from(nagiIngestState)
    .where(eq(nagiIngestState.key, "jetstream"))
    .limit(1);
  const cursor = saved[0]
    ? Math.max(0, saved[0].cursor - config.jetstreamReplaySeconds * 1_000_000)
    : undefined;
  const stream = new Jetstream({
    ws,
    endpoint: config.jetstreamUrl,
    wantedCollections: [...NAGI_INGEST_COLLECTIONS],
    cursor,
  });
  const queue = new SerialRetryQueue<any>(
    (evt) => withDidLock(String(evt.did ?? ""), () => processEvent(evt)),
    ({ item: evt, error, attempt, delayMs }) => {
      console.error("[ERROR][jetstream] Event processing failed; retrying", {
        did: evt?.did,
        collection: evt?.commit?.collection,
        rkey: evt?.commit?.rkey,
        attempt,
        delayMs,
        error,
      });
    },
  );

  const enqueue = (evt: any) => {
    if (typeof evt?.did === "string") prioritizeReconcile(evt.did);
    queue.enqueue(evt);
  };

  for (const collection of NAGI_INGEST_COLLECTIONS) {
    stream.onCreate(collection, enqueue);
    stream.onUpdate(collection, enqueue);
    stream.onDelete(collection, enqueue);
  }
  stream.on("error", console.error);
  stream.start();
  return {
    async close() {
      stream.close();
      await queue.close();
    },
    get queued() {
      return queue.size;
    },
  };
}
