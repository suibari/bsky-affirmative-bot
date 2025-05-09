import 'dotenv/config';
import { createOrRefreshSession, initAgent } from './bsky/agent.js';
import { postContinuous } from './bsky/postContinuous.js';
import { generateMorningGreets } from './gemini/generateMorningGreets.js';

/**
 * cron実行を前提とし、
 * 定期的に朝の挨拶を投稿する
 */
(async () => {
  console.log("[INFO] start cron routine.")
  await createOrRefreshSession();

  const text_bot = await generateMorningGreets();

  await postContinuous(text_bot);
  console.log("[INFO] posted morning greets.");
})();
