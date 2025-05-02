const agent = require('./bluesky');
const db = require('./database');
const { generateAnalyzeResult } = require('./gemini');
const { textToImageBufferWithBackground } = require('./canvas');

const { NICKNAMES_BOT, ANALYZE_TRIGGER } = require('./config/config');
const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)
const MINUTES_THRD_RESPONSE = 7 * 24 * 60 * 60 * 1000; // 7day

async function handleAnalyze (event, name_user) {
  // 呼ばれた判定
  const did = event.did;
  const text_user = event.commit.record.text;
  const isCalledMe = NICKNAMES_BOT.some(elem => text_user.includes(elem));
  const isPostToMe = agent.isReplyOrMentionToMe(event.commit.record);
  const isActiveAnalyze = ANALYZE_TRIGGER.some(elem => text_user.includes(elem));

  // 前回分析日時の取得
  const postedAt = new Date(event.commit.record.createdAt);
  const lastAnalyzeAtRaw = await db.selectDb(did, "last_analyze_at");
  const lastAnalyzeAt = lastAnalyzeAtRaw ? new Date(lastAnalyzeAtRaw) : new Date(0);
  const lastAnalyzeAtJst = new Date(lastAnalyzeAt.getTime() + OFFSET_UTC_TO_JST);

  // 時間判定
  const isPast = (postedAt.getTime() - lastAnalyzeAtJst.getTime() > MINUTES_THRD_RESPONSE) ;

  if ((isPast || process.env.NODE_ENV === "development") && (isCalledMe || isPostToMe) && isActiveAnalyze) {
    try {
      const str_lang = agent.getLangStr(event.commit.record.langs);
      const imgBuffer = await getFeedAndAnalyze(did, name_user, str_lang);

      // アップロード
      const response = await agent.uploadBlob(imgBuffer, {encoding: "image/png"});
  
      // リプライ
      const text_define = (str_lang === "日本語") ?
`${name_user}さんのポストから、あなたの性格を分析したよ！ 画像を貼るので見てみてね。性格分析は1週間に1回までしかできないので、時間がたったらまたやってみてね！` :
`${name_user}, I analyzed your personality from your posts! Check the image. You can only do personality analysis once a week, so try again after some time!`;
      const record = agent.getRecordFromEvent(
        event,
        text_define,
        {
          cid: response.data.blob.ref.$link,
          minetipe: response.data.blob.mimeType,
          alt: `${name_user}さんの全肯定分析結果!`,
        }
      );
      await agent.post(record);
  
      // DB登録 (リプライ成功時のみ)
      db.updateDb(did, "last_analyze_at", "CURRENT_TIMESTAMP");
      console.log("[INFO] send analyze-result for DID: " + did);
  
      if (process.env.NODE_ENV === "development") {
        console.log("[DEBUG] bot>>> " + text_define);
      }
  
      return true; // 処理済みを示す
    } catch (error) {
      // エラーハンドリング
      console.error("[ERROR] Failed to process analyze:", error);
      return true; // 処理失敗を示す
    }
  }  

  return false; // 処理されなかった
};

async function getFeedAndAnalyze(did, name_user, str_lang) {
  await agent.createOrRefleshSession(process.env.BSKY_IDENTIFIER, process.env.BSKY_APP_PASSWORD);

  // ポスト収集
  const postWithRP = await agent.getAuthorFeed({ 
    actor: did,
    limit: 100,
    filter: "posts_with_replies",
  });
  const posts = postWithRP.data.feed
    .filter(post => !post.reason)
    .map(post => post.post.record.text);

  // 占い
  const text_bot = await generateAnalyzeResult(name_user, str_lang, posts);

  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  const text_bot_split = text_bot.split("-----")[0];

  if (process.env.NODE_ENV === "development") {
    console.log("[DEBUG] bot>>> " + text_bot_split);
  }

  // 画像生成
  return textToImageBufferWithBackground(text_bot_split);
}

module.exports = {
  handleAnalyze,
  getFeedAndAnalyze,
};
