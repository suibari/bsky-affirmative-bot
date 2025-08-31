import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { agent } from "../bsky/agent";
import { handleFortune } from "../modes/fortune";
import { handleAnalyze } from "../modes/analyze";
import { handleDJ } from "../modes/dj";
import { parseEmbedPost } from "../bsky/parseEmbedPost";
import { handleCheer } from "../modes/cheer";
import { handleConversation } from "../modes/conversation";
import { handleFreq } from "../modes/frequency";
import { handleU18Release, handleU18Register } from "../modes/u18";
import { db, dbPosts } from "../db";
import retry from 'async-retry';
import { botBiothythmManager, followers, logger } from "..";
import { handleDiaryRegister, handleDiaryRelease } from "../modes/diary";
import { getSubscribersFromSheet } from "../gsheet";
import { replyai } from "../modes/replyai";
import { replyrandom } from "../modes/replyrandom";
import { EXEC_PER_COUNTS } from "../config";
import { handleAnniversaryConfirm, handleAnniversaryExec, handleAnniversaryRegister } from "../modes/anniversary";
import { isMention, isReplyOrMentionToMe } from "../bsky/util";

const OFFSET_UTC_TO_JST = 9 * 60 * 60 * 1000; // offset: +9h (to JST from UTC <SQlite3>)
const MINUTES_THRD_RESPONSE = 10 * 60 * 1000; // 10min
let count_replyrandom = 0; // AI応答用カウント

export async function callbackPost (event: CommitCreateEvent<"app.bsky.feed.post">) {
  const did = String(event.did);
  const record = event.commit.record as Record;
  let user: ProfileView | undefined;

  // ==============
  // Follower Filter
  // ==============
  const follower = followers.find(follower => follower.did === did);
  if (!follower) return;

  const subscribers = await getSubscribersFromSheet();

  try {
    retry(
      async () => {
        // ==============
        // Myself Filter
        // ここまでのフィルターで残るのは、以下
        // * フォロワーによるbotへのリプライ
        // * フォロワーによるbotへのメンション
        // * フォロワーによるリプライとメンションを除く通常ポスト
        // ==============
        // if (!isReplyOrMentionToMe(record) && !follower) return; // truthy
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
        // Mode Detect: All mode
        // -----------
        // 記念日は最優先とする
        if (await handleAnniversaryExec(event, follower, db) && logger.checkRPD()) {
          logger.addAnniversary();
          botBiothythmManager.addAnniversary();
          return;
        }

        if (await handleU18Release(event, db)) return;
        if (await handleU18Register(event, db)) return;
        if (await handleFreq(event, follower, db)) return;
        if (subscribers.includes(follower.did)) {
          if (await handleDiaryRegister(event, db)) return;
          if (await handleDiaryRelease(event, db)) return;
        }
        if (await handleAnniversaryRegister(event, follower, db)) return;
        if (await handleAnniversaryConfirm(event, follower, db)) return;

        if (await handleFortune(event, follower, db) && logger.checkRPD()) {
          logger.addFortune();
          botBiothythmManager.addFortune();
          return;
        }
        if (await handleAnalyze(event, follower, db) && logger.checkRPD()) {
          logger.addAnalysis();
          botBiothythmManager.addAnalysis();
          return;
        }

        if (subscribers.includes(follower.did)) {
          if (await handleDJ(event, follower, db) && logger.checkRPD()) {
            logger.addDJ();
            botBiothythmManager.addDJ();
            return;
          }
          if (await handleCheer(event, follower, db) && logger.checkRPD()) {
            logger.addCheer();
            botBiothythmManager.addCheer();
            return;
          }
        }

        // --------------
        // reply: conversation
        // --------------
        if (record.reply) {
          // サブスクライバー限定で会話機能発動する
          if (subscribers.includes(follower.did)) {
            if (await handleConversation(event, follower, db) && logger.checkRPD()) {
              logger.addConversation();
              botBiothythmManager.addConversation();
              return;
            }
          }

        // ==============
        // main: 通常ポスト or botへのメンション
        // ==============
        } else if (!isMention(record) || isReplyOrMentionToMe(record)) {
          // 確率判定
          const user_freq = await db.selectDb(did, "reply_freq");
          const isValidFreq = isJudgeByFreq(user_freq !== null ? Number(user_freq) : 100); // フォロワーだがレコードにないユーザーであるため、通過させる
          if (!isValidFreq) {
            console.log(`[INFO][${did}] Ignored post, REASON: freq (user_freq: ${user_freq})`);
            return;
          }

          let replyType: "ai" | "random" | null = null;
          if (subscribers.includes(follower.did)) {
            // --------------
            // post: subbed-follower
            // --------------
            console.log(`[INFO][${did}] New post: single post by subbed-follower !!`);
            replyType = "ai";

          } else {
            // --------------
            // post: NOT subbed-follower
            // --------------
            const postedAt = new Date(record.createdAt);
            const updatedAt = new Date(String(await db.selectDb(did, "updated_at")));
            const updatedAtJst = new Date(updatedAt.getTime() + OFFSET_UTC_TO_JST);
            const isPast = postedAt.getTime() - updatedAtJst.getTime() > MINUTES_THRD_RESPONSE;

            if (!isPast) {
              console.log(`[INFO][${did}] Ignored post, REASON: past 10min`);
              return;
            }

            console.log(`[INFO][${did}] New post: single post by NOT subbed-follower !!`);
            const isU18 = (await db.selectDb(did, "is_u18")) ?? 0;

            if (count_replyrandom >= EXEC_PER_COUNTS && isU18 === 0) {
              count_replyrandom = 0; // 最初にリセットして、2連続でAI応答するのを避ける
              // NOTE: ジャッジAIは費用負担が重く、OFFにする
              // const resultValidReplyai = await judgeReplySubject({
              //   follower,
              //   posts: [record.text],
              //   image: record.embed ? getImageUrl(did, record.embed as AppBskyEmbedImages.Main) : undefined,
              // });

              replyType = "ai";
            } else {
              count_replyrandom++;
              replyType = "random";
            }
          }

          // ----------------
          // リプライ呼び出しを最後にまとめる
          // ----------------
          if (replyType === "ai" && logger.checkRPD()) {
            await replyai(follower, event);
          } else if (replyType === "random") {
            await replyrandom(follower, event);
          } else {
            return;
          }

          // 全肯定した人数加算
          logger.addAffirmation(did);
          botBiothythmManager.addAffirmation(did);

          // DB更新
          db.insertOrUpdateDb(did);
        }
      }, {
        retries: 3,
        onRetry: (err, attempt) => {
          console.warn(`[WARN][${event.did}] Retry attempt ${attempt} to doReply:`, err);
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
