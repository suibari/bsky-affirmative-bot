import { MemoryService } from "@bsky-affirmative-bot/clients";
import { getConcatAuthorFeed } from "./getConcatAuthorFeed.js";
import { generateRoomWelcomeMessage } from "@bsky-affirmative-bot/bot-brain";
import axios from "axios";
import { postContinuous } from "./postContinuous.js";
import { splitUri, getLangStr, formatYMD } from "./util.js";
import { agent } from "./agent.js";
import { parseMonthDay, toMonthDayIso } from "@bsky-affirmative-bot/shared-configs";

/**
 * ユーザーがお部屋（お誘い）対象であるかを判定し、対象であれば
 * 出迎えメッセージのAI生成、お部屋サーバーへの送信、およびBlueskyへのお誘い投稿を実行します。
 * @param replyToUri リプライ先のユーザーポストのURI
 * @param replyToCid リプライ先のユーザーポストのCID
 * @param replyToRecord リプライ先のユーザーポストのレコードデータ
 */
export async function checkAndSendRoomInvitation(
  replyToUri: string,
  replyToCid: string,
  replyToRecord: any
): Promise<void> {
  try {
    const { did } = splitUri(replyToUri);
    if (!did) {
      console.warn(`[WARN][ROOM_INVITE] Failed to parse DID from URI: ${replyToUri}`);
      return;
    }

    // データベースからフォロワー情報を取得
    const followerRow = await MemoryService.getFollower(did);
    if (!followerRow || !followerRow.did) {
      console.log(`[INFO][ROOM_INVITE][${did}] Not found in database. Skipping.`);
      return;
    }

    // お部屋への来訪履歴がないユーザーは対象外
    if (!followerRow.last_room_visit_at) {
      // console.log(`[INFO][ROOM_INVITE][${did}] No room visit history. Skipping.`);
      return;
    }

    // すでにお誘い済みの場合は対象外 (room_invite_sent === 1)
    const isInviteSent = followerRow.room_invite_sent === 1;
    if (isInviteSent) {
      // console.log(`[INFO][ROOM_INVITE][${did}] Invitation already sent since last visit. Skipping.`);
      return;
    }

    const now = new Date();
    const lastVisit = new Date(followerRow.last_room_visit_at);
    const diffMs = now.getTime() - lastVisit.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    // 条件判定: 最終来訪から24時間以上経過 かつ 7日以内
    if (diffHours < 24 || diffDays > 7) {
      console.log(`[INFO][ROOM_INVITE][${did}] Visit timing mismatch. Visit was ${diffHours.toFixed(1)}h ago (Requires 24h to 7d). Skipping.`);
      return;
    }

    console.log(`[INFO][ROOM_INVITE][${did}] Eligible for room invitation! Last visit was ${diffHours.toFixed(1)}h ago.`);

    // 競合防止のため、お誘いフラグを即座に true (1) に更新して保存
    await MemoryService.updateFollower(did, "room_invite_sent", 1);

    // 1. 最新のBlueskyポストを最大5件取得
    let recentPosts: string[] = [];
    try {
      const feed = await getConcatAuthorFeed(did, 5);
      recentPosts = feed
        .map(item => (item.post.record as any).text)
        .filter((text): text is string => typeof text === "string" && text.trim().length > 0);
    } catch (err: any) {
      console.error(`[ERROR][ROOM_INVITE][${did}] Failed to fetch recent posts:`, err.message);
    }

    // 2. ユーザーのプロフィールを取得して表示名と登録日を特定
    let displayName = "ちゃん";
    let createdAtBsky: string | undefined;
    try {
      const profileResponse = await agent.getProfile({ actor: did });
      displayName = profileResponse.data.displayName || profileResponse.data.handle || "ちゃん";
      createdAtBsky = profileResponse.data.createdAt;
    } catch (err: any) {
      console.warn(`[WARN][ROOM_INVITE][${did}] Failed to fetch profile, using fallback:`, err.message);
    }

    // 3. 今日がBluesky登録記念日 / ユーザー登録記念日かチェック
    const lang = replyToRecord.langs?.[0];
    const todayIso = formatYMD(new Date(), lang);
    const todayMD = "--" + todayIso.slice(5);
    const annivNames: { ja: string; en: string }[] = [];
    if (createdAtBsky) {
      const d = new Date(createdAtBsky);
      if (!isNaN(d.getTime()) && formatYMD(d, lang) !== todayIso && toMonthDayIso(d) === todayMD) {
        annivNames.push({ ja: "Bluesky登録日", en: "The Day You Registered With Bluesky" });
      }
    }
    const { user_anniv_name, user_anniv_date } = followerRow;
    if (user_anniv_name && user_anniv_date) {
      const d = parseMonthDay(user_anniv_date);
      if (d && toMonthDayIso(d) === todayMD) {
        annivNames.push({ ja: user_anniv_name, en: user_anniv_name });
      }
    }
    const anniversary = annivNames.length > 0
      ? { ja: annivNames.map(a => a.ja).join("・"), en: annivNames.map(a => a.en).join(" & ") }
      : undefined;
    if (anniversary) {
      console.log(`[INFO][ROOM_INVITE][${did}] Today is anniversary: ${anniversary.ja}`);
    }

    // 4. お出迎えメッセージテキストをAI生成（日英同時に1回で生成）
    const langStr = getLangStr(replyToRecord.langs);
    console.log(`[INFO][ROOM_INVITE][${did}] Generating personalized welcome messages (JA & EN)...`);
    const welcomeMessages = await generateRoomWelcomeMessage(displayName, recentPosts, anniversary);
    console.log(`[INFO][ROOM_INVITE][${did}] Generated JA (${welcomeMessages.ja.length} chars), EN (${welcomeMessages.en.length} chars)`);

    // 5. お部屋サーバーの専用エンドポイントにテキストを送信
    const roomServerUrl = process.env.ROOM_SERVER_URL;
    const roomServerSecret = process.env.ROOM_SERVER_SECRET;

    if (roomServerUrl && roomServerSecret) {
      try {
        console.log(`[INFO][ROOM_INVITE][${did}] Sending welcome message to room server: ${roomServerUrl}`);
        await axios.post(roomServerUrl, {
          did,
          textJa: welcomeMessages.ja,
          textEn: welcomeMessages.en
        }, {
          headers: {
            "Authorization": `Bearer ${roomServerSecret}`,
            "Content-Type": "application/json"
          },
          timeout: 10000 // 10秒タイムアウト
        });
        console.log(`[INFO][ROOM_INVITE][${did}] Welcome message sent successfully.`);
      } catch (err: any) {
        console.error(`[ERROR][ROOM_INVITE][${did}] Failed to send message to room server:`, err.message);
      }
    } else {
      console.warn(`[WARN][ROOM_INVITE] ROOM_SERVER_URL or ROOM_SERVER_SECRET is not configured in .env. Skipping API call.`);
    }

    // 6. Blueskyにお誘いリプライを別投稿として送信
    const roomPageUrl = process.env.ROOM_PAGE_URL || "https://affirmative-room.vercel.app";
    let inviteReplyText = "";

    if (anniversary) {
      if (langStr === "日本語") {
        inviteReplyText = `${displayName}ちゃん、今日は${anniversary.ja}だね！お部屋に特別なお祝いボイスメッセージを用意したよ♪\n${roomPageUrl}`;
      } else {
        inviteReplyText = `Dear ${displayName}, today is ${anniversary.en}! I've prepared a special celebration message in my room♪\n${roomPageUrl}`;
      }
    } else if (langStr === "日本語") {
      inviteReplyText = `${displayName}ちゃん、お部屋にbotたんからの特別なボイスメッセージを用意したよ！\nよかったら聴きに来てね♪\n${roomPageUrl}`;
    } else {
      inviteReplyText = `Dear ${displayName}, I've prepared a special voice message for you in my room!\nPlease come and listen to it♪\n${roomPageUrl}`;
    }

    console.log(`[INFO][ROOM_INVITE][${did}] Posting separate invitation reply on Bluesky...`);
    
    // お誘いリプライを送信
    await postContinuous(
      inviteReplyText,
      {
        uri: replyToUri,
        cid: replyToCid,
        record: replyToRecord
      }
    );
    console.log(`[INFO][ROOM_INVITE][${did}] Invitation reply posted successfully.`);

  } catch (e: any) {
    console.error(`[ERROR][ROOM_INVITE] checkAndSendRoomInvitation crashed:`, e);
  }
}
