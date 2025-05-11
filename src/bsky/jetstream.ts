import { Jetstream } from "@skyware/jetstream";
import ws from "ws";

let jetstream: Jetstream | null = null;

// WebSocket接続の開始関数
export async function startWebSocket(
  postCallback?: (evt: any) => Promise<void>,
  followCallback?: (evt: any) => Promise<void>,
  likeCallback?: (evt: any) => Promise<void>,
) {
  if (jetstream) {
    console.log("[INFO] Closing previous Jetstream connection.");
    jetstream.close();
  }
  
  jetstream = new Jetstream({
    ws,
    endpoint: process.env.URL_JETSTREAM,
    wantedCollections: ["app.bsky.feed.post", "app.bsky.graph.follow", "app.bsky.feed.like"],
  });

  jetstream.start();
  console.log("[INFO] JetStream connection established.");

  jetstream.onCreate("app.bsky.feed.post", async event => {
    if (postCallback) {
      await postCallback(event);
    } else {
      console.error('[ERROR] No callback defined');
    }
  });
  jetstream.onCreate("app.bsky.graph.follow", async event => {
    if (followCallback) {
      await followCallback(event);
    } else {
      console.error('[ERROR] No callback defined');
    }
  });
  // jetstream.onCreate("app.bsky.feed.like", async event => {
  //   if (likeCallback) {
  //     await likeCallback(event);
  //   } else {
  //     console.error('[ERROR] No callback defined');
  //   }
  // });

  // エラーハンドリング
  jetstream.on("error", (err) => {
    console.error("[ERROR] WebSocket error:", err);
  });

  // 接続終了時
  jetstream.on("close", () => {
    console.log("[INFO] WebSocket connection closed.");
  });
}
