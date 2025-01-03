const ws = require("ws");

let jetstream = null;

// WebSocket接続の開始関数
async function startWebSocket(didArray, userCallback) {
  const { Jetstream } = await import("@skyware/jetstream");

  if (jetstream) {
    console.log("[INFO] Closing previous Jetstream connection.");
    jetstream.close();
  }
  
  // 現在のdidArrayで接続開始
  jetstream = new Jetstream({
    ws,
    wantedCollections: ["app.bsky.feed.post"],
    // wantedDids: didArray,  // 312要素より大きいと400 errorになる
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
