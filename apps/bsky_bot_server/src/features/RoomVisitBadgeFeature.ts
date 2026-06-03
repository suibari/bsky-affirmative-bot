import { MemoryService, botLabelerManager } from "@bsky-affirmative-bot/clients";
import { numberToEnglishWord, MAX_LEVEL } from "../util/index.js";
import { postContinuous } from "../bsky/postContinuous.js";
import { AppBskyFeedPost } from "@atproto/api";
import { getLatestPostOf, getLangStr } from "../bsky/util.js";

const BADGE_INTERVAL_MS = 3 * 60 * 1000; // 3分おきにポーリング
const BADGE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7日間

export async function awardRegularBadge(did: string): Promise<void> {
    const followerData = await MemoryService.getFollower(did);

    // 7日以内の再達成かどうかで次のレベルを決定
    const now = new Date();
    const lastBadgeAt = followerData?.last_regular_badge_at
        ? new Date(followerData.last_regular_badge_at)
        : null;
    const withinDeadline = lastBadgeAt && (now.getTime() - lastBadgeAt.getTime()) < BADGE_EXPIRY_MS;

    const currentLevel = followerData?.regular_level || 0;

    // room_badge_pending を先にリセット（付与失敗時もフラグ残留を防ぐ）
    await MemoryService.updateFollower(did, "room_badge_pending", 0);

    // 既にMAXかつ有効期限内なら更新不要
    if (currentLevel >= MAX_LEVEL && withinDeadline) {
        console.log(`[INFO][BADGE][REGULAR] ${did}: already at MAX level, skipping badge update`);
        return;
    }

    const nextLevel = withinDeadline ? Math.min(currentLevel + 1, MAX_LEVEL) : 1;
    const isNewMax = nextLevel === MAX_LEVEL && currentLevel < MAX_LEVEL;
    const levelLabel = isNewMax ? 'Lv. MAX' : `Lv.${nextLevel}`;

    console.log(`[INFO][BADGE][REGULAR] ${did}: level ${currentLevel} -> ${nextLevel} (withinDeadline=${withinDeadline})`);

    const nextBadgeId = `regular-lv-${numberToEnglishWord(nextLevel)}`;

    // 旧バッジを negate
    if (currentLevel > 0) {
        const prevBadgeId = `regular-lv-${numberToEnglishWord(currentLevel)}`;
        await botLabelerManager.applyLabel(did, prevBadgeId, true).catch(err => {
            console.error(`[WARN][BADGE][REGULAR] Failed to negate previous badge ${prevBadgeId} for ${did}:`, err.message);
        });
    }

    // 新しいバッジ定義を upsert
    await botLabelerManager.upsertLabelDefinition(nextBadgeId, [
        {
            lang: "ja",
            name: `常連さん ${levelLabel}`,
            description: `botたんからのお誘いに${nextLevel}回連続で応えた証！`
        },
        {
            lang: "en",
            name: `Regular Visitor ${levelLabel}`,
            description: `Proof of accepting bot-tan's invitation ${nextLevel} time(s) in a row!`
        }
    ]);

    // 7日間期限でバッジを付与
    const expDate = new Date(now.getTime() + BADGE_EXPIRY_MS).toISOString();
    await botLabelerManager.applyLabel(did, nextBadgeId, false, expDate);

    // DB 更新
    await MemoryService.updateFollower(did, "regular_level", nextLevel);
    await MemoryService.updateFollower(did, "last_regular_badge_at", now);

    console.log(`[INFO][BADGE][REGULAR] Successfully applied badge ${nextBadgeId} to ${did} (exp=${expDate})`);

    // Lv. MAX 到達時の祝福リプライ
    if (isNewMax) {
        try {
            const latestFeed = await getLatestPostOf(did);
            if (latestFeed) {
                const postRecord = latestFeed.post.record as AppBskyFeedPost.Record;
                const displayName = latestFeed.post.author.displayName || latestFeed.post.author.handle;
                const langStr = getLangStr(postRecord.langs);
                const maxText = langStr === "日本語"
                    ? `${displayName}ちゃん、常連さん Lv. MAXに到達したよ！🎉\n心からおめでとう！これからもよろしくね💖`
                    : `Dear ${displayName}, you've reached Regular Visitor Lv. MAX! 🎉\nCongratulations from the bottom of my heart! Let's keep going together💖`;
                await postContinuous(maxText, { uri: latestFeed.post.uri, cid: latestFeed.post.cid, record: postRecord });
            }
        } catch (err: any) {
            console.error(`[ERROR][BADGE][REGULAR] Failed to send MAX level congratulatory reply for ${did}:`, err.message);
        }
    }
}

async function syncRegularBadges(): Promise<void> {
    try {
        const pendingFollowers = await MemoryService.getPendingBadgeFollowers();
        if (pendingFollowers.length === 0) return;

        console.log(`[INFO][BADGE][REGULAR] Found ${pendingFollowers.length} pending badge(s).`);
        for (const follower of pendingFollowers) {
            try {
                await awardRegularBadge(follower.did);
            } catch (err: any) {
                console.error(`[ERROR][BADGE][REGULAR] Failed to award badge for ${follower.did}:`, err.message);
            }
        }
    } catch (err: any) {
        console.error(`[ERROR][BADGE][REGULAR] syncRegularBadges crashed:`, err.message);
    }
}

export async function scheduleRegularBadgeSync(): Promise<void> {
    console.log("[INFO][BADGE][REGULAR] Scheduling regular badge synchronization...");

    setInterval(syncRegularBadges, BADGE_INTERVAL_MS);

    // 起動直後（5秒後）に1回即時実行し、再起動時の取りこぼしを防ぐ
    setTimeout(syncRegularBadges, 5000);
}
