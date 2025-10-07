import { readFileSync } from "fs";
import { generateQuestion } from "../gemini/generateQuestion";
import { postContinuous } from "../bsky/postContinuous";
import { logger } from "..";
import { db } from "../db";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { getSubscribersFromSheet } from "../gsheet";
import { generateQuestionsAnswer } from "../gemini/generateQuestionsAnswer";
import { CommitCreateEvent } from "@skyware/jetstream";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { getImageUrl, getLangStr, uniteDidNsidRkey } from "../bsky/util";
import { AppBskyEmbedImages } from "@atproto/api";
import { ImageRef } from "../types";

class QuestionMode {
  async postQuestion() {
    // 質問生成
    const {text, theme} = await generateQuestion();

    // 投稿
    const {uri, cid} = await postContinuous(text);

    // 質問記憶更新
    logger.setQuestionState(uri, theme);
    console.log(`[INFO][QUESTION] Posted question: ${uri} / theme: ${theme}`);

    return true;
  }

  async postReplyOfAnswer(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
    const record = event.commit.record as Record;
    const langStr = getLangStr(record.langs);
    const uri = uniteDidNsidRkey(follower.did, event.commit.collection, event.commit.rkey);

    // 質問情報取得
    const {uriQuestionRoot, themeQuestion} = logger.getQuestionState();
    if (!uriQuestionRoot || !themeQuestion) {
      console.log(`[INFO][QUESTION][${follower.did}] No question found`);
      return false;
    }

    // ユーザ回答スレッドチェック: わからないけど安全のため
    const uriRecordRoot = record.reply?.root.uri;
    if (uriRecordRoot !== uriQuestionRoot) {
      console.log(`[INFO][QUESTION][${follower.did}] not question root`);
      return false;
    }

    // 回答制限のチェック
    const rows = await db.selectRows(["did", "question_root_uri", "last_answered_at"]);
    const todaysAnswered = rows?.filter(row => row.question_root_uri === uriQuestionRoot);
    // * 回答済みなら早期リターン
    if (todaysAnswered?.some(row => row.did === follower.did)) {
      return false;
    }
    // * 10件以上回答済みなら非サブスクは早期リターン
    // const subscribers = await getSubscribersFromSheet();
    // if (todaysAnswered && todaysAnswered.length >= 10 && subscribers.includes(follower.did) === false) {
    //   return false;
    // }

    // 画像読み取り
    const image = getImageUrl(follower.did, record.embed);

    // 質問への回答
    const text = await generateQuestionsAnswer({
      follower,
      posts: [record.text],
      langStr,
      image,
    }, themeQuestion);
    await postContinuous(text, {
      uri,
      cid: String(event.commit.cid),
      record,
    });

    // DB更新
    db.updateDb(follower.did, "question_root_uri", uriQuestionRoot);
    db.updateDb(follower.did, "last_answered_at", new Date().toISOString());
    console.log(`[INFO][QUESTION] Replied to answer from ${follower.did}: ${uri}`);

    return true;
  }
}

export const question = new QuestionMode();
