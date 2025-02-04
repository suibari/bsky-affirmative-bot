require('dotenv').config();
const { generateUranaiResult } = require('../src/gemini');
const agent = require('../src/bluesky');

/**
 * test関数
 * 占い結果の出力
 * 本番環境で実行すると実際にポストする
 */
(async () => {
  const text_bot = await generateUranaiResult("test_user", "英語");

  const record = {
    text: text_bot,
  };

  await agent.postContinuous(record);

  if (process.env.NODE_ENV === "development") {
    console.log("[DEBUG] bot>>> " + text_bot);
  }
})();