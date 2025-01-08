const agent = require('./bluesky');
const db = require('./database');
const { conversation } = require('./gemini');

const ARRAY_MYNAME = ["全肯定botたん", "全肯定たん", "botたん", "全肯定botたそ", "全肯定たそ", "botたそ"];
const ARRAY_WORD_CONV = ["お喋り", "おしゃべり", "相談", "質問", "お話", "おはなし"];
const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)
const MINUTES_THRD_RESPONSE = 10 * 60 * 1000; // 10min
const MAX_BOT_MEMORY = 40;

const flagsWaiting = new Map();

const handleConversation = async (event, name_user) => {
  const did = event.did;
  const text_user = event.commit.record.text;
  const isCalledMe = ARRAY_MYNAME.some(elem => text_user.includes(elem));
  const isPostToMe = agent.isReplyOrMentionToMe(event.commit.record);
  const isActiveConv = ARRAY_WORD_CONV.some(elem => text_user.includes(elem));

  // 同じユーザが処理中か確認
  if (flagsWaiting.get(did)) {
    return false;
  }

  // 前回占い日時の取得
  const postedAt = new Date(event.commit.record.createdAt);
  const lastConvAt = new Date(await db.selectDb(did, "last_conv_at"));
  const lastConvAtJst = new Date(lastConvAt.getTime() + OFFSET_UTC_TO_JST);

  // 時間判定
  const isPast = (postedAt.getTime() - lastConvAtJst.getTime() > MINUTES_THRD_RESPONSE) || (process.env.NODE_ENV === "development");

  // 会話継続判定
  const rootUriDb = await db.selectDb(did, "conv_root_uri");
  const rootUri = event.commit.record.reply?.root.uri;
  const isValidRootUri = (rootUriDb === rootUri);

  if (isPast && 
    (((isCalledMe || isPostToMe) && isActiveConv) || // 最初の呼びかけ、呼びかけ直し
    isValidRootUri)) // 2回目以降の会話
    {
    try {
      flagsWaiting.set(did, true);

      // 前回までの会話取得
      const history = await db.selectDb(did, "conv_history");

      // 応答生成
      const image_url = agent.getImageUrl(event);
      const {new_history, text_bot} = await conversation(name_user, text_user, image_url, JSON.parse(history));

      // MINUTES_THRD_RESPONSE 分待つ
      console.log(`[INFO][${did}] Waiting conversation...`);
      await new Promise(resolve => setTimeout(resolve, MINUTES_THRD_RESPONSE));

      // リプライ
      const record = agent.getRecordFromEvent(event, text_bot);
      await agent.post(record);

      // historyのクリップ処理
      while (new_history.length > MAX_BOT_MEMORY) {
        new_history.shift(); // 先頭から削除
      }

      // DB登録 (リプライ成功時のみ)
      db.updateDb(did, "last_conv_at", "CURRENT_TIMESTAMP");
      db.updateDb(did, "conv_history", JSON.stringify(new_history));
      db.updateDb(did, "conv_root_uri", rootUri);
      console.log("[INFO] send coversation-result for DID: " + did);
  
      if (process.env.NODE_ENV === "development") {
        console.log("[DEBUG] bot>>> " + text_bot);
      }
  
      return true; // 処理済みを示す
    } catch (error) {
      // エラーハンドリング
      console.error("[ERROR] Failed to process uranai:", error);
      return true; // 処理失敗を示す
    } finally {
      flagsWaiting.delete(did);
    }
  }  

  return false; // 処理されなかった
};

module.exports = handleConversation;
