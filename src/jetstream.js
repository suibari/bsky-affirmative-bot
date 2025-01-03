const ws = require("ws");

// WebSocket接続の開始関数
async function startWebSocket(didArray, userCallback) {
  const { Jetstream } = await import("@skyware/jetstream");
  
  const jetstream = new Jetstream({
    ws,
    wantedCollections: ["app.bsky.feed.post"],
    wantedDids: didArray,
  });
  jetstream.start();
  console.log("[INFO] JetStream connection established.");

  jetstream.onCreate("app.bsky.feed.post", async event => {
    // ユーザーが設定したコールバック関数を呼び出し
    if (userCallback) {
      await userCallback(event);
    } else {
      console.error('[ERROR] No callback defined. record:', record);
    }
  });

  // エラーハンドリング
  jetstream.on("error", (err) => {
    console.error("[ERROR] WebSocket error:", err);
  });

  // 接続終了時
  jetstream.on("close", () => {
    console.log("[INFO] WebSocket connection closed.");
  });
}

// モジュールをエクスポート
module.exports.startWebSocket = startWebSocket;
