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
    // 期限切れ後に再訪してもレベルが変わらない場合（例: Lv.1失効 → 再訪でLv.1維持）は
    // prevBadgeId === nextBadgeId になる。これは「バッジの交代」ではなく「同じバッジの更新（exp延長）」。
    const prevBadgeId = currentLevel > 0 ? `regular-lv-${numberToEnglishWord(currentLevel)}` : null;
    const expDate = new Date(now.getTime() + BADGE_EXPIRY_MS).toISOString();

    // 新しいバッジ定義を先に upsert
    // （ラベル定義が無い状態で付与すると、クライアント側でバッジ名/説明が解決できないため）
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

    // 新バッジを先に付与する（7日間期限）。
    // 旧実装は「旧バッジを negate → 新バッジ定義を upsert（PDSへの getRecord/putRecord 往復や
    // OCC競合時の再試行を含み、数百ms〜数秒かかりうる）→ 新バッジを apply」の順だったため、
    // その間 regular-lv-X 系のラベルが一つも有効でない空白期間が生まれ、ブラウザ上でバッジが
    // 一時的に消えて見える不具合があった（DBの regular_level 自体は最後に更新するため常に正しい）。
    // 先に新バッジを有効化することで、この空白期間を解消する。
    await botLabelerManager.applyLabel(did, nextBadgeId, false, expDate);

    // 旧バッジの剥奪は、ID が新バッジと異なる場合のみ行う。
    // ラベラーは (uri, val) の組ごとに「最後に書き込まれた行の neg 値」で有効/無効を判定するため
    // （labeler_server の /active-dids は MAX(id) の neg を見ている）、prevBadgeId === nextBadgeId
    // のケースで negate を実行すると、直前に付与したばかりの新バッジを自分自身で即座に
    // 打ち消すことになってしまう。しかも room_badge_pending は処理冒頭で既に 0 にリセット済み
    // のため、次回のお部屋訪問まで二度とバッジが復活しない（現状の「一時的なチラつき」より
    // 深刻な「消えたまま」になる）。同レベル更新の場合は上記の apply（exp延長）だけで成立するため、
    // 剥奪自体が不要であり、スキップする。
    if (prevBadgeId && prevBadgeId !== nextBadgeId) {
        await botLabelerManager.applyLabel(did, prevBadgeId, true).catch(err => {
            console.error(`[WARN][BADGE][REGULAR] Failed to negate previous badge ${prevBadgeId} for ${did}:`, err.message);
        });
    }

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
