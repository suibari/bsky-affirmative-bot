import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { isMention, isReplyOrMentionToMe } from "../bsky/util";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { agent } from "../bsky/agent";
import { handleFortune } from "../modes/fortune";
import { handleAnalyze } from "../modes/analyze";
import { handleDJ } from "../modes/dj";
import { parseEmbedPost } from "../bsky/parseEmbedPost";
import { botBiothythmManager } from "../biorhythm";
import { handleCheer } from "../modes/cheer";
import { handleConversation } from "../modes/conversation";
import { handleFreq } from "../modes/frequency";
import { handleU18Release, handleU18Register } from "../modes/u18";
import { replyAffermativeWord } from "../bsky/replyAffirmativeWord";
import { db, dbNotFollowers, dbPosts } from "../db";
import retry from 'async-retry';
import { followers } from "..";

const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)
const MINUTES_THRD_RESPONSE = 10 * 60 * 1000; // 10min

export async function callbackPost (event: CommitCreateEvent<"app.bsky.feed.post">) {
  const did = String(event.did);
  const record = event.commit.record as Record;
  let user: ProfileView | undefined;

  const follower = followers.find(follower => follower.did === did);

  try {
    retry(
      async () => {
        // ==============
        // Reply/Mention or Follower or Myself Filter (IMPORTANT!!)
        // ==============
        if (!isReplyOrMentionToMe(record) && !follower) return;
        if ((did === process.env.BSKY_DID)) return;

        // ==============
        // Spam Filter
        // ==============
        const text = record.text;
        const donate_word = ["donate", "donation", "donating", "gofund.me", "paypal.me"];
        // check text
        const isIncludedDonate = donate_word.some(elem => 
          text.toLowerCase().includes(elem.toLowerCase())
        );
        if (isIncludedDonate) {
          return;
        }
        // parse embed
        if (record.embed) {
          const {text_embed, uri_embed, image_embed} = await parseEmbedPost(record);
          // check embed text
          const isIncludedDonateQuote = 
            donate_word.some(elem => 
              text_embed?.toLowerCase().includes(elem.toLowerCase())
            ) || 
            donate_word.some(elem =>
              uri_embed?.toLowerCase().includes(elem.toLowerCase())
            );
          if (isIncludedDonateQuote) {
            return;
          }
        }
        // check label
        const labelsForbidden = ["spam"];
        const {data} = await agent.getProfile({actor: did});
        if (data.labels) {
          for (const label of data.labels) {
            if (labelsForbidden.some(elem => elem === label.val)) {
              return;
            }
          }
        }

        // -----------
        // Reply/Mention Filter
        // -----------
        if (isReplyOrMentionToMe(record)) {
          console.log(`[INFO][${did}] New post: reply/mention me by all users !!`);
          user = follower;
          if (!user) {
            // フォロワーでなければSpam Filterチェック時のProfileを使う
            user = data as ProfileView;
          }

          // -----------
          // Mode Detect (All user)
          // -----------
          const targetDb = follower ? db : dbNotFollowers;
          if (await handleFortune(event, user, targetDb)) {
            botBiothythmManager.addFortune();
            return;
          }
          if (await handleAnalyze(event, user, targetDb)) {
            botBiothythmManager.addAnalysis();
            return;
          }
          if (await handleDJ(event, user, targetDb)) {
            botBiothythmManager.addDJ();
            return;
          }
        }

        // -----------
        // Follower Filter
        // -----------
        if (follower) {
          // -----------
          // Mode Detect (only followers)
          // -----------
          // 定型文モード解除
          if (await handleU18Release(event, db)) return;

          // 定型文モード
          if (await handleU18Register(event, db)) return;

          // リプ頻度調整モード
          if (await handleFreq(event, follower, db)) return;

          // 占いモード
          if (await handleFortune(event, follower, db)) {
            botBiothythmManager.addFortune();
            return;
          }

          // 分析モード
          if (await handleAnalyze(event, follower, db)) {
            botBiothythmManager.addAnalysis();
            return;
          }

          // 応援モード
          if (await handleCheer(event, follower, db)) {
            botBiothythmManager.addCheer();
            return;
          }

          // DJモード
          if (await handleDJ(event, follower, db)) {
            botBiothythmManager.addDJ();
            return;
          }

          // 会話モード
          if (await handleConversation(event, follower, db)) {
            botBiothythmManager.addConversation();
            return;
          }

          // ==============
          // main
          // ==============
          // フィルタリング: リプライでない、かつメンションでない投稿を対象とする
          if (!record.reply && !isMention(record)) {

            // 前回反応日時の取得
            const postedAt = new Date(record.createdAt);
            const updatedAt = new Date(String(await db.selectDb(did, "updated_at")));
            const updatedAtJst = new Date(updatedAt.getTime() + OFFSET_UTC_TO_JST);

            // 時間判定
            const isPast = (postedAt.getTime() - updatedAtJst.getTime() > MINUTES_THRD_RESPONSE);

            // 確立判定
            const user_freq = await db.selectDb(did, "reply_freq");
            const isValidFreq = isJudgeByFreq(user_freq !== null ? Number(user_freq) : 100); // フォロワーだがレコードにないユーザーであるため、通過させる

            if (isPast && isValidFreq) {
              try {
                // U18情報をDBから取得
                const is_u18 = Number(await db.selectDb(did, "is_u18"));

                // 新しい投稿の検出とリプライ処理
                console.log(`[INFO][${did}] New post: single post by follower !!`);
                const result = await replyAffermativeWord(follower, event, is_u18 === 1);

                // ポストスコア記憶
                dbPosts.insertDb(did);
                const prevScore = Number(await dbPosts.selectDb(did, "score") || 0);
                if (result.score && prevScore < result.score &&
                  !follower.displayName?.toLowerCase().includes("bot") // botを除外
                ) {
                  // お気に入りポスト更新
                  dbPosts.updateDb(did, "post", (event.commit.record as Record).text);
                  dbPosts.updateDb(did, "score", result.score);
                }

                // 全肯定した人数加算
                botBiothythmManager.addAffirmation(did);

                // DB更新
                db.insertOrUpdateDb(did);
              } catch (replyError) {
                console.error(`[ERROR][${did}] Failed to reply or update DB:`, replyError);
              }
            } else {
              console.log(`[INFO][${did}] Ignored post, past:${isPast}/freq:${isValidFreq}`);
            }
          } else {
            console.log(`[INFO][${did}] Ignored post, follower but reply or mention`);
          }
        }
      }, {
        retries: 3,
        onRetry: (err, attempt) => {
          console.warn(`[WARN] Retry attempt ${attempt} to doReply:`, err);
        },
      }
    )
  } catch (e) {
    
  }
}

function isJudgeByFreq(probability: number) {
  if (probability < 0 || probability > 100) {
    throw new Error("Probability must be between 0 and 100.");
  }

  return Math.random() * 100 < probability;
}
