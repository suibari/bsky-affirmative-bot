const agent = require('./bluesky');
const db = require('./database');
const { point } = require('./logger');

const  {PREDEFINEDMODE_TRIGGER, PREDEFINEDMODE_RELEASE_TRIGGER } = require('./config/config');
const TEXT_RELEASE_U18 = "定型文モードを解除しました! これからはたまにAIを使って全肯定しますね。";
const TEXT_REGISTER_U18 = "定型文モードを設定しました! これからはAIを使わずに全肯定しますね。";

const handleU18Registration = async (event) => {
  // U18登録解除処理
  const did = event.did;
  const text_user = event.commit.record.text;
  const isPostToMe = agent.isReplyOrMentionToMe(event.commit.record);
  const isInactiveU18 = PREDEFINEDMODE_RELEASE_TRIGGER.some(elem => text_user.includes(elem));

  if (isPostToMe && isInactiveU18) {
      // リプライ
      const record = agent.getRecordFromEvent(event, TEXT_RELEASE_U18);
      await agent.post(record);

      // DB登録
      db.updateDb(did, "is_u18", 0);
      console.log("[INFO] RELEASE U18-mode for DID: " + did);

      return true; // 処理済みを示す
  }

  // U18登録処理
  const isActiveU18 = PREDEFINEDMODE_TRIGGER.some(elem => text_user.includes(elem));
  if (isPostToMe && isActiveU18) {
      // リプライ
      const record = agent.getRecordFromEvent(event, TEXT_REGISTER_U18);
      await agent.post(record);

      // DB登録
      db.updateDb(did, "is_u18", 1);
      console.log("[INFO] SET U18-mode for DID: " + did);

      return true; // 処理済みを示す
  }

  return false; // 処理されなかった
};

module.exports = handleU18Registration;
