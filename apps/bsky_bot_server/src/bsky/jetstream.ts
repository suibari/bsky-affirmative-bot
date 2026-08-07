import {
  startBotJetstream,
  type BotJetstreamConnection,
  type JetstreamCallback,
} from "@bsky-affirmative-bot/bot-runtime";
import { reportHealthFailure, reportHeartbeat } from "@bsky-affirmative-bot/clients";

let connection: BotJetstreamConnection | null = null;

export async function startWebSocket(
  postCallback?: JetstreamCallback,
  followCallback?: JetstreamCallback,
  likeCallback?: JetstreamCallback,
  followDeleteCallback?: JetstreamCallback,
) {
  connection?.close();

  connection = startBotJetstream({
    endpoint: process.env.URL_JETSTREAM,
    wantedCollections: [
      "app.bsky.feed.post",
      "app.bsky.graph.follow",
      "app.bsky.feed.like",
    ],
    onCreate: {
      ...(postCallback ? { "app.bsky.feed.post": postCallback } : {}),
      ...(followCallback ? { "app.bsky.graph.follow": followCallback } : {}),
      ...(likeCallback ? { "app.bsky.feed.like": likeCallback } : {}),
    },
    onDelete: {
      ...(followDeleteCallback
        ? { "app.bsky.graph.follow": followDeleteCallback }
        : {}),
    },
    onHealth: (event) => {
      const report = event.ok
        ? reportHeartbeat("jetstream-bsky", event.detail)
        : reportHealthFailure("jetstream-bsky", event.error);
      report.catch((e) =>
        console.error("[ERROR] Failed to report Jetstream health:", e),
      );
    },
  });
}
