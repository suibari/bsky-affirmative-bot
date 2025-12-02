import { logger, botBiothythmManager } from "../index";
import { dbReplies, dbPosts } from "../db";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { splitUri } from "../bsky/util";
import { postContinuous } from "../bsky/postContinuous";
import { WhimsicalPostGenerator } from "../gemini/generateWhimsicalPost";
import { MyMoodSongGenerator } from "../gemini/generateMyMoodSong";
import { searchSpotifyUrlAndAddPlaylist } from "../spotify";
import { generateGoodNight } from "../gemini/generateGoodNight";
import { repost } from "../bsky/repost";
import { AtpAgent } from "@atproto/api";
import { getPds } from "../bsky/getPds";
import { generateQuestion } from "../gemini/generateQuestion";
import { agent } from "../bsky/agent";
import retry from 'async-retry';

const whimsicalPostGen = new WhimsicalPostGenerator();
const myMoodSongGen = new MyMoodSongGenerator();
let isJapanesePost = true;

export async function doWhimsicalPost() {
    const langStr = isJapanesePost ? "日本語" : "English";

    // ユーザーからのリプライを取得
    const userReplies = await dbReplies.selectRows(["reply"]) as string[] | null;

    // Step1: ポスト文生成
    const currentMood = botBiothythmManager.getMood;
    let text_bot = await retry(
        async (bail, attempt) => {
            const generatedText = await whimsicalPostGen.generate({
                langStr: langStr,
                currentMood,
                userReplies: userReplies ?? undefined,
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
        const resultSpotify = await retry(
            async (bail, attempt) => {
                // AI生成
                currentGeneratedSong = await myMoodSongGen.generate(currentMood, langStr);

                // Spotify検索: ここで見つからなければリトライさせるねらい
                const spotifySearchTerm = { artist: currentGeneratedSong.artist, track: currentGeneratedSong.title };
                const url = await searchSpotifyUrlAndAddPlaylist(spotifySearchTerm);

                // 見つからなければエラーを投げてリトライさせる
                if (!url) {
                    throw new Error("Spotify URL not found, retrying...");
                }

                return url;
            },
            {
                retries: 3,
                onRetry: (error: any, attempt) => {
                    console.warn(`[WARN] Spotify search failed on attempt ${attempt}: ${error.message}`);
                },
            }
        );
        songInfo = `\n\nMyMoodSong:\n${currentGeneratedSong.title} - ${currentGeneratedSong.artist}\n${resultSpotify}`;
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error(`[ERROR] Failed to find Spotify song after multiple retries: ${errorMessage}`);
        songInfo = `\n\nMyMoodSong:\n${currentGeneratedSong.title} - ${currentGeneratedSong.artist}\n(Not found in Spotify...)`;
    }

    text_bot += songInfo;

    const { uri, cid } = await postContinuous(text_bot);

    // 投稿URIを保存 (リプライに反応するようにするため)
    logger.setWhimsicalPostRoot(uri);

    // リプライ記憶をクリア
    dbReplies.clearAllRows();

    // 言語を切り替え
    isJapanesePost = !isJapanesePost;
}

export async function doGoodNightPost(mood: string) {
    // スコアTOPのfollowerを取得 (上位5人)
    const rows = await dbPosts.getHighestScore();

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

            // Gemini生成
            const text_bot = await generateGoodNight({
                topFollower: topPostData.topFollower ?? undefined,
                topPost: topPostData.post,
                currentMood: mood,
            });

            // ポスト
            const { uri, cid } = await postContinuous(text_bot);

            // 投稿URIを保存 (リプライに反応するようにするため)
            logger.setWhimsicalPostRoot(uri);
        } else {
            console.log("[INFO] No valid top post found after trying all highest score entries.");
        }
    } catch (e) {
        console.error(`[INFO] good night post error: ${e}`);
    } finally {
        // 1日のテーブルクリア
        dbPosts.clearAllRows();
    }
}

export async function doQuestionPost() {
    // 質問生成
    const { text, theme } = await generateQuestion();

    // 投稿
    const { uri, cid } = await postContinuous(text);

    // 質問記憶更新
    logger.setQuestionState(uri, theme);
    console.log(`[INFO][QUESTION] Posted question: ${uri} / theme: ${theme}`);

    return true;
}
