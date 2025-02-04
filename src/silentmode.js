const agent = require('./bluesky');
const db = require('./database');

const REGEX_FREQ = /freq(\d+)/gi;

const handleRegisterFreq = async (event, name_user) => {
  // U18登録解除処理
  const did = event.did;
  const text_user = event.commit.record.text;
  const isPostToMe = agent.isReplyOrMentionToMe(event.commit.record);
  const match_freq =  REGEX_FREQ.exec(text_user);

  if (isPostToMe && match_freq) {
    try {
      const freq_user = match_freq[1]; // 数値部分

      // エラーチェック: 0~100の整数か
      if (freq_user < 0 || freq_user > 100) {
        return false;
      }

      
      // リプライ
      const text_bot = `了解! ${name_user}さんへのリプライする頻度を${freq_user}%にするね! ちなみに占いはいつでもできるよ～`;
      const record = agent.getRecordFromEvent(event, text_bot);
      await agent.postContinuous(record);
  
      // DB登録 (リプライ成功時のみ)
      db.updateDb(did, "reply_freq", freq_user);
      console.log(`[INFO] update reply frequency to ${freq_user}%, for DID: ${did}`);
  
      return true; // 処理済みを示す
    } catch (error) {
      // エラーハンドリング
      console.error("[ERROR] Failed to process uranai:", error);
      return true; // 処理失敗を示す
    }
  }

  return false; // 処理されなかった
};

module.exports = handleRegisterFreq;
