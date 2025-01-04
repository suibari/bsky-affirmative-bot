const agent = require('./bluesky');
const db = require('./database');
const { generateUranaiResult } = require('./gemini');
const { point } = require('./logger');

const ARRAY_WORD_URANAI = ["占い", "うらない"];

const handleUranai = async (event, name_user) => {
  // U18登録解除処理
  const did = event.did;
  const text_user = event.commit.record.text;
  const isPostToMe = agent.isReplyOrMentionToMe(event.commit.record);
  const isActiveUranai = ARRAY_WORD_URANAI.some(elem => text_user.includes(elem));

  if (isPostToMe && isActiveUranai) {
    // 占い
    const text_bot = await generateUranaiResult(name_user);

    // リプライ
    const record = agent.getRecordFromEvent(event, text_bot);
    await agent.post(record);

    // DB登録
    db.updateDb(did, "last_uranai_at", "CURRENT_TIMESTAMP");
    console.log("[INFO] send uranai-result for DID: " + did);

    if (process.env.NODE_ENV === "development") {
      console.log("[DEBUG] bot>>> " + text_bot);
    }

    return true; // 処理済みを示す
  }

  return false; // 処理されなかった
};

module.exports = handleUranai;
