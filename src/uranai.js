const agent = require('./bluesky');
const db = require('./database');
const { generateUranaiResult } = require('./gemini');

const ARRAY_WORD_URANAI = ["占い", "うらない"];
const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)
const MINUTES_THRD_RESPONSE = 8 * 60 * 60 * 1000; // 8hour

const handleUranai = async (event, name_user) => {
  // U18登録解除処理
  const did = event.did;
  const text_user = event.commit.record.text;
  const isPostToMe = agent.isReplyOrMentionToMe(event.commit.record);
  const isActiveUranai = ARRAY_WORD_URANAI.some(elem => text_user.includes(elem));

  // 前回占い日時の取得
  const postedAt = new Date(event.commit.record.createdAt);
  const lastUranaiAt = new Date(await db.selectDb(did, "last_uranai_at"));
  const lastUranaiAtJst = new Date(lastUranaiAt.getTime() + OFFSET_UTC_TO_JST);

  // 時間判定
  const isPast = (postedAt.getTime() - lastUranaiAtJst.getTime() > MINUTES_THRD_RESPONSE);

  if (isPast && isPostToMe && isActiveUranai) {
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
