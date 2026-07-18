import { Jetstream } from "@skyware/jetstream";
import ws from "ws";
import { db, nagiIngestState } from "@bsky-affirmative-bot/database";
import { NAGI_COLLECTIONS } from "@bsky-affirmative-bot/nagi-lexicon";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { processEvent } from "./processEvent.js";
export async function startJetstream() {
  const saved = await db
    .select()
    .from(nagiIngestState)
    .where(eq(nagiIngestState.key, "jetstream"))
    .limit(1);
  const cursor = saved[0] ? Math.max(0, saved[0].cursor - 5_000_000) : undefined;
  const stream = new Jetstream({
    ws,
    endpoint: config.jetstreamUrl,
    wantedCollections: [...NAGI_COLLECTIONS],
    cursor,
  });
  for (const collection of NAGI_COLLECTIONS) {
    stream.onCreate(collection, processEvent);
    stream.onUpdate(collection, processEvent);
    stream.onDelete(collection, processEvent);
  }
  stream.on("error", console.error);
  stream.start();
  return stream;
}
