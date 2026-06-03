import { MemoryService, botLabelerManager, LeafletDiaryService } from "@bsky-affirmative-bot/clients";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { splitUri } from "../bsky/util.js";
import { postContinuous } from "../bsky/postContinuous.js";
import { WhimsicalPostGenerator } from "@bsky-affirmative-bot/bot-brain";
import { MyMoodSongGenerator } from "@bsky-affirmative-bot/bot-brain";
import { getSpotifyPlaylist, searchSpotifyUrlAndAddPlaylist } from "@bsky-affirmative-bot/bot-brain";
import { generateGoodNight } from "@bsky-affirmative-bot/bot-brain";
import { repost } from "../bsky/repost.js";
import { AtpAgent } from "@atproto/api";
import { getPds } from "../bsky/getPds.js";
import { generateQuestion, searchYoutubeLink } from "@bsky-affirmative-bot/bot-brain";
import { agent } from "../bsky/agent.js";
import retry from 'async-retry';

const whimsicalPostGen = new WhimsicalPostGenerator();
const myMoodSongGen = new MyMoodSongGenerator();
let isJapanesePost = true;

export async function doWhimsicalPost(currentMood: string) {
    const langStr = isJapanesePost ? "日本語" : "English";

    // ユーザーからのリプライを取得
    let userReplies: string[] | null = null;
    try {
        userReplies = await MemoryService.getUnreadReplies();
    } catch (e) {
        console.error("Failed to get unread replied", e);
    }

    // ギフトコンテキストを決定（3日以上前のギフット、50%確率）
    let giftContext: { content: string; displayName: string; type: "used" } | undefined;
    let giftIdToUpdate: number | undefined;

    if (Math.random() < 0.5) {
        const oldGift = await MemoryService.getRandomOldGift();
        if (oldGift) {
            const displayName = await fetchDisplayName(oldGift.did);
            giftContext = { content: oldGift.content, displayName, type: "used" };
            giftIdToUpdate = oldGift.id;
        }
    }

    // Step1: ポスト文生成
    // const currentMood = botBiothythmManager.getMood; // Removed, using arg
    let text_bot = await retry(
        async (bail, attempt) => {
            const generatedText = await whimsicalPostGen.generate({
                langStr: langStr,
                currentMood,
                userReplies: userReplies ?? undefined,
                giftContext,
            });
            if (!generatedText) {
                throw new Error("Whimsical post generation failed, retrying...");
            }
            return generatedText;
        },
        {
            retries: 3,
            onRetry: (error: any, attempt) => {
                console.warn(`[WARN] Whimsical post generation failed on attempt ${attempt}: ${error.message}`);
            },
        }
    );

    // Step2: ムードソング
    let songInfo = "";
    let currentGeneratedSong = { title: "Unknown", artist: "Unknown" };

    try {
        const resultYoutube = await retry(
            async (bail, attempt) => {
                // AI生成
                currentGeneratedSong = await myMoodSongGen.generate(currentMood, langStr);

                // Youtube検索: ここで見つからなければリトライさせるねらい
                const url = await searchYoutubeLink(`${currentGeneratedSong.artist} ${currentGeneratedSong.title}`);

                // 見つからなければエラーを投げてリトライさせる
                if (!url) {
                    throw new Error("Youtube URL not found, retrying...");
                }

                return url;
            },
            {
                retries: 3,
                onRetry: (error: any, attempt) => {
                    console.warn(`[WARN] Youtube search failed on attempt ${attempt}: ${error.message}`);
                },
            }
        );
        songInfo = `\n\nMyMoodSong:\n${currentGeneratedSong.title} - ${currentGeneratedSong.artist}\n${resultYoutube}`;
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error(`[ERROR] Failed to find Youtube song after multiple retries: ${errorMessage}`);
        songInfo = `\n\nMyMoodSong:\n${currentGeneratedSong.title} - ${currentGeneratedSong.artist}\n(Not found in Youtube...)`;
    }

    text_bot += songInfo;

    const { uri, cid } = await postContinuous(text_bot);

    // ギフトのstatusを更新
    if (giftIdToUpdate !== undefined && giftContext) {
        await MemoryService.updateGiftStatus(giftIdToUpdate, giftContext.type);
    }

    // 投稿URIを保存 (リプライに反応するようにするため)
    await MemoryService.setWhimsicalPostRoots([uri]);

    // リプライ記憶をクリア
    await MemoryService.clearReplies();

    // 言語ごとの投稿数をカウント
    await MemoryService.incrementLang(langStr as any);

    // 言語を切り替え
    isJapanesePost = !isJapanesePost;
}

export async function doGoodNightPost(mood: string) {
    // 1. 現在のフォロワー数を取得
    let currentFollowers = 0;
    try {
        const selfProfile = await agent.getProfile({ actor: process.env.BSKY_IDENTIFIER! });
        currentFollowers = selfProfile.data.followersCount ?? 0;
        console.log(`[INFO] Current followers count: ${currentFollowers}`);
    } catch (e) {
        console.error("[ERROR] Failed to fetch bot self profile for follower count:", e);
    }

    // 2. 前日のフォロワー数をDBから取得し、またぎ判定
    const lastFollowers = await MemoryService.getBotState("last_follower_count");
    let followerMilestone: number | undefined = undefined;

    if (lastFollowers !== null && lastFollowers !== undefined && currentFollowers > 0) {
        const prevMilestone = Math.floor(lastFollowers / 1000);
        const currMilestone = Math.floor(currentFollowers / 1000);
        if (currMilestone > prevMilestone) {
            followerMilestone = currMilestone * 1000;
            console.log(`[INFO] Follower milestone hit: ${followerMilestone}`);
        }
    }

    // 3. スコアTOPのfollowerを取得 (上位5人)
    const rows = await MemoryService.getHighestScorePosts();

    let topPostData: { uri: string; did: string; nsid: string; rkey: string; post: string; cid: string; topFollower: ProfileView } | null = null;

    for (const row of rows) {
        try {
            // DBパース
            const uri: string = row.uri;
            const { did, nsid, rkey } = splitUri(uri);
            const postContent: string = row.post;
            const topFollower = (await agent.getProfile({ actor: did })).data as ProfileView;

            // cid取得
            const agentPDS = new AtpAgent({ service: await getPds(did!) });
            const response = await agentPDS.com.atproto.repo.getRecord({
                repo: did,
                collection: nsid,
                rkey,
            });
            const cid = response.data.cid;

            if (postContent && cid) {
                topPostData = { uri, did, nsid, rkey, post: postContent, cid, topFollower };
                break; // 成功した最初の投稿を使用
            }
        } catch (e) {
            console.error(`[INFO] Failed to get record for ${row.uri}, trying next: ${e}`);
            // 次のレコードを試すため、ループを続行
        }
    }

    try {
        if (topPostData) {
            // リポスト
            await repost(topPostData.uri, topPostData.cid);

            // diary_count を1回インクリメント（日英共通）
            let diaryCount = 1;
            try {
                const current = await MemoryService.getBotState("diary_count") || 0;
                diaryCount = current + 1;
                await MemoryService.setBotState("diary_count", diaryCount);
            } catch (err) {
                console.error("[ERROR][DIARY] Failed to manage diary_count:", err);
            }

            // Leaflet日記を生成してパブリッシュ (日本語)
            let diaryUrl: string | undefined = undefined;
            if (process.env.LEAFLET_USERNAME) {
                try {
                    console.log("[INFO][DIARY] Generating and publishing Leaflet diary (Japanese)...");
                    diaryUrl = await LeafletDiaryService.generateAndPostDiary(agent, diaryCount, 'ja');
                    console.log(`[INFO][DIARY] Leaflet diary (Japanese) published successfully: ${diaryUrl}`);
                } catch (e: any) {
                    console.error("[ERROR][DIARY] Failed to generate and publish Leaflet diary (Japanese):", e.message);
                }
            } else {
                console.log("[INFO][DIARY] LEAFLET_USERNAME is not set. Skipping diary posting.");
            }

            // Leaflet日記を生成してパブリッシュ (英語)
            let diaryUrlEn: string | undefined = undefined;
            if (process.env.LEAFLET_USERNAME) {
                try {
                    console.log("[INFO][DIARY] Generating and publishing Leaflet diary (English)...");
                    diaryUrlEn = await LeafletDiaryService.generateAndPostDiary(agent, diaryCount, 'en');
                    console.log(`[INFO][DIARY] Leaflet diary (English) published successfully: ${diaryUrlEn}`);
                } catch (e: any) {
                    console.error("[ERROR][DIARY] Failed to generate and publish Leaflet diary (English):", e.message);
                }
            }

            // 当日の新着ギフット確認（全候補のdisplayNameを取得してGeminiに渡す）
            let giftCandidates: { id: number; content: string; displayName: string }[] | undefined;
            const todayGifts = await MemoryService.getTodayNewGifts();
            if (todayGifts.length > 0) {
                giftCandidates = await Promise.all(
                    todayGifts.map(async (g: any) => ({
                        id: g.id,
                        content: g.content,
                        displayName: await fetchDisplayName(g.did),
                    }))
                );
            }

            // Gemini生成（プレゼント候補を渡し、感性で選択しつつあいさつ生成）
            const goodNightResult = await generateGoodNight({
                topFollower: topPostData.topFollower ?? undefined,
                topPost: topPostData.post,
                currentMood: mood,
                followerMilestone: followerMilestone,
                giftCandidates,
            });

            const uris: string[] = [];

            // 日英1テキストをそのまま投稿（postContinuous が自動でスレッド分割）
            if (goodNightResult.text) {
                const { uri } = await postContinuous(goodNightResult.text);
                uris.push(uri);
            }

            // 投稿URIを保存 (リプライに反応するようにするため)
            if (uris.length > 0) {
                await MemoryService.setWhimsicalPostRoots(uris);
            }

            // ギフットのstatusを更新（Geminiが選んだプレゼントのみ）
            if (giftCandidates && giftCandidates.length > 0) {
                const idx = goodNightResult.selectedGiftIndex ?? 0;
                const selectedGift = giftCandidates[idx] ?? giftCandidates[0];
                await MemoryService.updateGiftStatus(selectedGift.id, "introduced");
            }
        } else {
            console.log("[INFO] No valid top post found after trying all highest score entries.");
        }
    } catch (e) {
        console.error("[ERROR] good night post error:", e);
    } finally {
        // 最新フォロワー数をDBに保存（おやすみポストが正常に処理された後に保存）
        if (currentFollowers > 0) {
            await MemoryService.setBotState("last_follower_count", currentFollowers);
            console.log(`[INFO] Saved follower count to DB: ${currentFollowers}`);
        }

        // Statsリセット
        await MemoryService.resetDailyStats();
        // 1日のテーブルクリア
        await MemoryService.clearPosts();
    }
}

async function fetchDisplayName(did: string): Promise<string> {
    try {
        const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const profile = await res.json() as { displayName?: string; handle?: string };
        return profile.displayName || profile.handle || did;
    } catch (e) {
        console.error(`[WARN] Failed to fetch display name for ${did}:`, e);
        return did;
    }
}

export async function doQuestionPost() {
    // 質問生成
    const { text, theme } = await generateQuestion();

    // 投稿
    const { uri, cid } = await postContinuous(text);

    // 質問記憶更新
    await MemoryService.setQuestionState(uri, theme);
    console.log(`[INFO][QUESTION] Posted question: ${uri} / theme: ${theme}`);

    return true;
}
