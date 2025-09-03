import 'dotenv/config';
import { createOrRefreshSession, initAgent } from './bsky/agent.js';
import { db, initializeDatabases } from './db/index.js';
import { startWebSocket } from './bsky/jetstream.js';
import { getConcatFollowers } from './bsky/getConcatFollowers.js';
import { ProfileView } from '@atproto/api/dist/client/types/app/bsky/actor/defs.js';
import { callbackPost } from './main/callbackPost.js';
import { callbackLike } from './main/callbackLike.js';
import { callbackFollow } from './main/callbackFollow.js';
import { scheduleAllUserDiaries } from './modes/diary.js';
import { BiorhythmManager } from './biorhythm/index.js';
import { Logger } from './logger/index.js';
import { startServer } from './server/index.js';

export let followers: ProfileView[] = []; 
export let botBiothythmManager: BiorhythmManager;
export let logger: Logger;

// フォロワー収集
(async () => {
  try {
    console.log("[INFO] Initialize AtpAgent...");
    await initAgent();

    // 日記はinitAgent後に非同期実行
    scheduleAllUserDiaries();

    console.log("[INFO] Fetching followers...");
    followers = await getConcatFollowers({actor: process.env.BSKY_IDENTIFIER!});
    console.log(`[INFO] finished fething followers: ${followers.length}`);
  } catch (error) {
    console.error("[ERROR] Failed to update followers:", error);
  }
})();

// JetStream接続
(async () => {
  try {
    console.log("[INFO] Initialize DB...");
    await initializeDatabases();

    console.log("[INFO] Connecting to JetStream...");
    await startWebSocket(callbackPost, callbackFollow, callbackLike);
  } catch (error) {
    console.error("[ERROR] Failed to start WebSocket:", error);
  }
})();
// global.fetch = require('node-fetch'); // for less than node-v17

// バイオリズム開始
(async () => {
  logger = new Logger();
  botBiothythmManager = new BiorhythmManager();
  await botBiothythmManager.init(); // 非同期初期化を待つ
  console.log("[INFO] Initialized biorhythm manager...");

  await botBiothythmManager.step();
  console.log("[INFO] update biorhythm...");

  startServer(botBiothythmManager, logger);
  console.log("[INFO] starting server!");
})();

// アプリケーションの終了時にデータベース接続を閉じる
process.on('exit', async () => {
  db.closeDb();
});

// Ctrl+Cなどでアプリケーションを終了する場合もデータベース接続を閉じる
process.on('SIGINT', async () => {
  db.closeDb();
  process.exit();
});
