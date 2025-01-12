const agent = require('./bluesky');
const db = require('./database');
const { conversation } = require('./gemini');

const ARRAY_MYNAME = ["全肯定botたん", "全肯定たん", "botたん", "全肯定botたそ", "全肯定たそ", "botたそ"];
const ARRAY_WORD_CONV = ["お喋り", "おしゃべり", "相談", "質問", "お話", "おはなし", "会話", "？", "?"];
const MINUTES_THRD_RESPONSE = 10 * 60 * 1000; // 10min
const MAX_BOT_MEMORY = 100;

const flagsWaiting = new Map();

const handleConversation = async (event, name_user) => {
  const did = event.did;

  // 同じユーザが処理中か確認、処理中なら無視
  if (flagsWaiting.get(did)) {
    return false;
  }

  const text_user = event.commit.record.text;
  const isCalledMe = ARRAY_MYNAME.some(elem => text_user.includes(elem));
  const isPostToMe = agent.isReplyOrMentionToMe(event.commit.record);
  const isActiveConv = ARRAY_WORD_CONV.some(elem => text_user.includes(elem));

  // 会話継続判定: eventにはuriは直接含まれずめんどくさいのでcidで比較する
  const rootCidDb = await db.selectDb(did, "conv_root_cid");
  const reply = event.commit.record.reply;
  let rootCid =  reply?.root.cid;
  const parentUri = reply?.parent.uri;
  const {did: parantDid} = parentUri ? agent.splitUri(parentUri) : {did: undefined};
  const isValidRootCid = (rootCidDb) && (rootCidDb == rootCid); // DBに存在=会話済み
  const isValidParent = (process.env.BSKY_DID === parantDid); // ポストの親ポストがbotのポスト

  if ((((isCalledMe || isPostToMe) && isActiveConv) || // 最初の呼びかけ、呼びかけ直し
    (isValidRootCid && isValidParent))) // 2回目以降の会話
    {
    try {
      flagsWaiting.set(did, true);

      // 前回までの会話取得
      const history = await db.selectDb(did, "conv_history");

      // 応答生成
      const image_url = agent.getImageUrl(event);
      const {new_history, text_bot} = await conversation(name_user, text_user, image_url, JSON.parse(history));

      // いいね応答
      await agent.like(event);

      // MINUTES_THRD_RESPONSE 分待つ
      if (process.env.NODE_ENV === "production") {
        console.log(`[INFO][${did}] Waiting conversation...`);
        await new Promise(resolve => setTimeout(resolve, MINUTES_THRD_RESPONSE));
      }

      // リプライ
      const record = agent.getRecordFromEvent(event, text_bot);
      await agent.post(record);

      // historyのクリップ処理
      while (new_history.length > MAX_BOT_MEMORY) {
        new_history.shift(); // 先頭から削除
      }

      // 初回の呼びかけまたは呼びかけし直しならreplyがないのでそのポストのcidを取得
      if (!rootCid) {
        rootCid = event.commit.cid;
      }

      // DB登録 (リプライ成功時のみ)
      db.updateDb(did, "last_conv_at", "CURRENT_TIMESTAMP");
      db.updateDb(did, "conv_history", JSON.stringify(new_history));
      db.updateDb(did, "conv_root_cid", rootCid);
      console.log(`[INFO][${did}] send coversation-result`);
  
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
