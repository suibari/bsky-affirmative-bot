const agent = require('./bluesky');
const db = require('./database');
const { point } = require('./logger');

const ARRAY_WORD_O18 = ["定型文モード解除", "Disable Predefined Reply Mode"];
const ARRAY_WORD_U18 = ["定型文モード", "Predefined Reply Mode"];
const TEXT_RELEASE_U18 = "定型文モードを解除しました! これからはたまにAIを使って全肯定しますね。";
const TEXT_REGISTER_U18 = "定型文モードを設定しました! これからはAIを使わずに全肯定しますね。";

const handleU18Registration = async (event) => {
  // U18登録解除処理
  const did = event.did;
  const text_user = event.commit.record.text;
  const isPostToMe = agent.isReplyOrMentionToMe(event.commit.record);
  const isInactiveU18 = ARRAY_WORD_O18.some(elem => text_user.includes(elem));

  if (isPostToMe && isInactiveU18) {
      // リプライ
      const record = agent.getRecordFromEvent(event, TEXT_RELEASE_U18);
      await agent.post(record);
      point.addCreate();

      // DB登録
      db.updateU18Db(did, 0);
      console.log("[INFO] RELEASE U18-mode for DID: " + did);

      return true; // 処理済みを示す
  }

  // U18登録処理
  const isActiveU18 = ARRAY_WORD_U18.some(elem => text_user.includes(elem));
  if (isPostToMe && isActiveU18) {
      // リプライ
      const record = agent.getRecordFromEvent(event, TEXT_REGISTER_U18);
      await agent.post(record);
      point.addCreate();

      // DB登録
      db.updateU18Db(did, 1);
      console.log("[INFO] SET U18-mode for DID: " + did);

      return true; // 処理済みを示す
  }

  return false; // 処理されなかった
};

module.exports = handleU18Registration;
