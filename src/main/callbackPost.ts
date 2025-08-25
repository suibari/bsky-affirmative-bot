import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { CommitCreateEvent } from "@skyware/jetstream";
import { getImageUrl, isMention, isReplyOrMentionToMe } from "../bsky/util";
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
import { db, dbPosts } from "../db";
import retry from 'async-retry';
import { followers } from "..";
import { handleDiaryRegister, handleDiaryRelease } from "../modes/diary";
import { getSubscribersFromSheet } from "../gsheet";
import { logger } from "../logger";
import { replyai } from "../modes/replyai";
import { replyrandom } from "../modes/replyrandom";
import { EXEC_PER_COUNTS } from "../config";
import { judgeReplySubject } from "../gemini/judgeReplySubject";
import { AppBskyEmbedImages } from "@atproto/api";

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
        // Mode Detect: All mode
        // -----------
        if (await handleU18Release(event, db)) return;
        if (await handleU18Register(event, db)) return;
        if (await handleFreq(event, follower, db)) return;
        if (await handleDiaryRegister(event, db)) return;
        if (await handleDiaryRelease(event, db)) return;

        if (await handleFortune(event, follower, db) && await logger.checkRPD()) {
          botBiothythmManager.addFortune();
          return;
        }
        if (await handleAnalyze(event, follower, db) && await logger.checkRPD()) {
          botBiothythmManager.addAnalysis();
          return;
        }

        if (subscribers.includes(follower.did) && await logger.checkRPD()) {
          if (await handleDJ(event, follower, db)) {
            botBiothythmManager.addDJ();
            return;
          }
          if (await handleCheer(event, follower, db)) {
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
            if (await handleConversation(event, follower, db)) {
              botBiothythmManager.addConversation();
              return;
            }
          }

        // ==============
        // main
        // ==============
        } else if (!isMention(record)) {
          // 確率判定
          const user_freq = await db.selectDb(did, "reply_freq");
          const isValidFreq = isJudgeByFreq(user_freq !== null ? Number(user_freq) : 100); // フォロワーだがレコードにないユーザーであるため、通過させる
          if (!isValidFreq) {
            console.log(`[INFO][${did}] Ignored post, REASON: freq (user_freq: ${user_freq})`);
            return;
          }

          if (subscribers.includes(follower.did)) {
            // --------------
            // post: subbed-follower
            // --------------
            console.log(`[INFO][${did}] New post: single post by subbed-follower !!`);
            const result = await replyai(follower, event);

            // ポストスコア記憶
            dbPosts.insertDb(did);
            if (result !== null) {
              const prevScore = Number(await dbPosts.selectDb(did, "score") || 0);
              if (result.score && prevScore < result.score &&
                !follower.displayName?.toLowerCase().includes("bot") // botを除外
              ) {
                // お気に入りポスト更新
                dbPosts.updateDb(did, "post", (event.commit.record as Record).text);
                dbPosts.updateDb(did, "score", result.score);
              }
            }
          } else {
            // 非サブスクメンバーは時間判定後、AIor定型文リプライ
            // 時間判定
            const postedAt = new Date(record.createdAt);
            const updatedAt = new Date(String(await db.selectDb(did, "updated_at")));
            const updatedAtJst = new Date(updatedAt.getTime() + OFFSET_UTC_TO_JST);
            const isPast = (postedAt.getTime() - updatedAtJst.getTime() > MINUTES_THRD_RESPONSE);
            if (!isPast) {    
              console.log(`[INFO][${did}] Ignored post, REASON: past 10min`);
              return;
            }
            
            // --------------
            // post: NOT subbed-follower
            // --------------
            console.log(`[INFO][${did}] New post: single post by NOT subbed-follower !!`);
            const isU18 = await db.selectDb(did, "is_u18") ?? 0; // null, undefinedは0扱い
            if (count_replyrandom >= EXEC_PER_COUNTS && isU18 === 0) {
              // AIリプライすべきかをAI判定
              const resultValidReplyai = await judgeReplySubject({
                follower,
                posts: [record.text],
                image: record.embed ? getImageUrl(did, record.embed as AppBskyEmbedImages.Main) : undefined,
              });
              // console.log(`[DEBUG][${did}] judgeReplySubject: ${resultValidReplyai.comment}`);

              if (!resultValidReplyai.result) {
                // AIリプライNGなら定型文リプライ
                // カウントはしきい値以上なのでそのままとする
                await replyrandom(follower, event);
              } else {
                // AIリプライ
                count_replyrandom = 0; // カウントリセット
                await replyai(follower, event);
              }
            } else {
              // 定型文リプライ
              count_replyrandom++;
              await replyrandom(follower, event);
            }
          }

          // 全肯定した人数加算
          botBiothythmManager.addAffirmation(did);

          // DB更新
          db.insertOrUpdateDb(did);
        } else {
          console.log(`[INFO][${did}] Ignored post, REASON: mention`);
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
