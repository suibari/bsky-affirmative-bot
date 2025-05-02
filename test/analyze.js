require('dotenv').config();
const { getFeedAndAnalyze } = require('../src/analyze');
const agent = require('../src/bluesky');

/**
 * test関数
 * 占い結果の出力
 * 本番環境で実行すると実際にポストする
 */
(async () => {
  const did = "did:plc:uixgxpiqf4i63p6rgpu7ytmx";
  const name_user = "すいばり"

  await agent.createOrRefleshSession(process.env.BSKY_IDENTIFIER, process.env.BSKY_APP_PASSWORD);
  const imgBuffer = await getFeedAndAnalyze(did, name_user, ["ja"]);
  // await getFeedAndAnalyze(did, name_user, ["en"]);

  console.log("[INFO] imgBuffer: ", imgBuffer.length / 1024);

  // const record = {
  //   text: text_bot,
  // };

  // await agent.postContinuous(record);
})();
