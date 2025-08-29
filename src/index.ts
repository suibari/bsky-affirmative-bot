import 'dotenv/config';
import { createOrRefreshSession, initAgent } from './bsky/agent.js';
import { db, initializeDatabases } from './db/index.js';
import { startWebSocket } from './bsky/jetstream.js';
import { pointRateLimit } from './util/logger.js';
import { getConcatFollowers } from './bsky/getConcatFollowers.js';
import { ProfileView } from '@atproto/api/dist/client/types/app/bsky/actor/defs.js';
import { callbackPost } from './main/callbackPost.js';
import { callbackLike } from './main/callbackLike.js';
import { callbackFollow } from './main/callbackFollow.js';
import { handleDiary, scheduleHandleDiary } from './modes/diary.js';

export let followers: ProfileView[] = [];

// 起動時処理
(async () => {
  try {
    console.log("[INFO] Initialize DB...");
    await initializeDatabases();

    console.log("[INFO] Initialize AtpAgent...");
    await initAgent();

    console.log("[INFO] Fetching followers...");
    followers = await getConcatFollowers({actor: process.env.BSKY_IDENTIFIER!, limit: 100});

    console.log("[INFO] Connecting to JetStream...");
    await startWebSocket(callbackPost, callbackFollow, callbackLike);
  } catch (error) {
    console.error("[ERROR] Failed to update followers and start WebSocket:", error);
  }
})();
// global.fetch = require('node-fetch'); // for less than node-v17

// 1時間おきにセッション確認、Rate Limit Pointを出力
setInterval(async () => {
  await createOrRefreshSession()
  
  const currentPoint = pointRateLimit.getPoint();
  console.log(`[INFO] rate limit point is ${currentPoint} on this hour.`);
  pointRateLimit.initPoint();
}, 60 * 60 * 1000); // 1 hour

// 日記機能: PM22時にhandleDiaryを実行
await scheduleHandleDiary();

// アプリケーションの終了時にデータベース接続を閉じる
process.on('exit', async () => {
  db.closeDb();
});

// Ctrl+Cなどでアプリケーションを終了する場合もデータベース接続を閉じる
process.on('SIGINT', async () => {
  db.closeDb();
  process.exit();
});
