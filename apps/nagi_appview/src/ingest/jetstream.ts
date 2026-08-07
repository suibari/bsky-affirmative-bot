import { Jetstream } from "@skyware/jetstream";
import ws from "ws";
import {
  db,
  nagiIngestState,
  reportHealthFailure,
  reportHeartbeat,
} from "@bsky-affirmative-bot/database";
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
  let connected = false;
  let stopping = false;
  const heartbeatDetail = { endpoint: config.jetstreamUrl };
  const reportConnected = () => {
    if (!connected) return;
    reportHeartbeat("jetstream-appview", heartbeatDetail).catch((error) =>
      console.error("[ERROR][APPVIEW][JETSTREAM] Failed to report heartbeat:", error),
    );
  };
  const heartbeat = setInterval(reportConnected, 30_000);
  heartbeat.unref();
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
  stream.on("open", () => {
    connected = true;
    reportConnected();
  });
  stream.on("error", (error) => {
    connected = false;
    console.error(error);
    reportHealthFailure("jetstream-appview", error).catch(() => {});
  });
  stream.on("close", () => {
    connected = false;
    if (!stopping) {
      reportHealthFailure(
        "jetstream-appview",
        new Error("Jetstream connection closed"),
      ).catch(() => {});
    }
  });
  stream.start();
  return {
    async close() {
      stopping = true;
      clearInterval(heartbeat);
      stream.close();
      await queue.close();
    },
    get queued() {
      return queue.size;
    },
  };
}
