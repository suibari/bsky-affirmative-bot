require('dotenv').config();
const agent = require('./src/bluesky.ts');
const { generateMorningGreets } = require('./src/gemini.ts');

/**
 * cron実行を前提とし、
 * 定期的に朝の挨拶を投稿する
 */
(async () => {
  console.log("[INFO] start cron routine.")
  await agent.createOrRefleshSession(process.env.BSKY_IDENTIFIER, process.env.BSKY_APP_PASSWORD);

  const text_bot = await generateMorningGreets();

  const record = {
    text: text_bot,
  };

  await agent.post(record);
  console.log("[INFO] posted morning greets.");

  if (process.env.NODE_ENV === "development") {
    console.log("[DEBUG] bot>>> " + text_bot);
  }
})();