import { CommitCreateEvent } from '@skyware/jetstream';
import { DIARY_REGISTER_TRIGGER, DIARY_RELEASE_TRIGGER } from '../config/index.js';
import { handleMode } from './index.js';
import { db, SQLite3 } from '../db/index.js';
import { getConcatProfiles } from '../bsky/getConcatProfiles.js';
import { getTodaysAuthorFeed } from '../bsky/getTodaysAuthorFeed.js';
import { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post.js';
import { generateDiary } from '../gemini/generateDiary.js';
import { ProfileView } from '@atproto/api/dist/client/types/app/bsky/actor/defs.js';
import { getLangStr } from '../bsky/util.js';
import { postContinuous } from '../bsky/postContinuous.js';
import { agent, createOrRefreshSession } from '../bsky/agent.js';
import { textToImageBufferWithBackground } from '../util/canvas.js';
import { getSubscribersFromSheet } from '../gsheet/index.js';

const TEXT_REGISTER_DIARY = "日記モードを設定しました! これから毎日、PM10時にあなたの今日のできごとを日記にしてまとめるね!";
const TEXT_RELEASE_DIARY = "日記モードを解除しました! また使ってね!";

export async function handleDiaryRegister (event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
  return await handleMode(event, {
    triggers: DIARY_REGISTER_TRIGGER,
    db,
    dbColumn: "is_diary",
    dbValue: 1,
    generateText: TEXT_REGISTER_DIARY,
  });
}

export async function handleDiaryRelease (event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3) {
  return await handleMode(event, {
    triggers: DIARY_RELEASE_TRIGGER,
    db,
    dbColumn: "is_diary",
    dbValue: 0,
    generateText: TEXT_RELEASE_DIARY,
  });
}

export async function handleDiary (db: SQLite3) {
  // 日記モードのユーザを取得
  const dids = await db.selectAllDb("is_diary", 1) as string[] || null;
  if (dids === null || dids.length === 0) return

  // didsに含まれるサブクスライバーを取得
  const subscribers = await getSubscribersFromSheet();
  const subscriberSet = new Set(subscribers);
  const matchedDids = dids.filter(did => subscriberSet.has(did));

  if (matchedDids) {

    // 取得したDIDからプロフィールをまとめて取得
    const profiles = await getConcatProfiles({actors: matchedDids});

    // 各プロフィールに対して日記モードの処理を行う
    for (const [index, profile] of profiles.entries()) {
      try {
        // 1日のポスト取得
        const feed = await getTodaysAuthorFeed(profile.did);
        if ( feed.length === 0) {
          console.log(`[INFO][${profile.did}] No posts found for today.`);
          continue; // 今日のポストがない場合はスキップ
        }
        console.log(`[INFO][${profile.did}] processing diary mode... ${index}/${matchedDids.length}`);
        const posts = feed.map(item => (item.post.record as Record).text);

        // リプライのための最新ポストを取得
        const latestPost = feed.find(item => !item.reply)?.post;
        if (!latestPost) {
          console.log(`[INFO][${profile.did}] All post are reply.`);
          continue; // ポストがすべてリプライの場合もスキップ
        }
        const langStr = getLangStr((latestPost.record as Record).langs); // 1つ目のポストから言語を取得

        // 日記生成
        const text_bot = await generateDiary({
          follower: profile as ProfileView,
          posts: posts.reverse(), // そのままだと最新のポストからAIが読み出しするので、逆にする
          langStr,
        });

        // 画像生成
        console.log(`[INFO][${profile.did}] generating image...`);
        const today = new Date();
        const formattedDate = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
        const buffer =  await textToImageBufferWithBackground(text_bot + `\n\n${formattedDate}`);
        const {blob} = (await agent.uploadBlob(buffer, {encoding: "image/png"})).data;

        // ポスト
        const TEXT_DIARY = (langStr === "日本語") ?
          `${profile.displayName}さんへ、今日の日記をまとめたよ! 画像を貼るので見てみてね。おやすみ～!` :
          `${profile.displayName}, I summarized your diary for today! Check the image. Good night!`;
        await postContinuous(TEXT_DIARY, {
          uri: latestPost.uri,
          cid: latestPost.cid,
          record: latestPost.record as Record
        }, {blob, alt: `Dear ${profile.displayName}, From 全肯定botたん`});
      } catch (e: any) {
        console.error(e)
      }
    } // for loop
  }
}

export async function scheduleHandleDiary() {
  const now = new Date();
  const nextRun = new Date(now);

  await createOrRefreshSession();

  // 開発環境では即実行
  // if (process.env.NODE_ENV === 'development') {
  //   await handleDiary(db);
  // }

  nextRun.setHours(22, 0, 0, 0); // 今日の22:00に設定

  if (now >= nextRun) {
    // すでに22:00を過ぎていれば明日の22:00
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const delay = nextRun.getTime() - now.getTime();
  console.log(`[INFO] handleDiary scheduled in ${delay / 1000 / 60} minutes.`);

  setTimeout(async () => {
    try {
      console.log("[INFO] Executing handleDiary at 22:00...");
      await handleDiary(db);
    } catch (error) {
      console.error("[ERROR] Failed to execute handleDiary:", error);
    }

    // 次の日に再スケジュール
    scheduleHandleDiary();
  }, delay);
}
