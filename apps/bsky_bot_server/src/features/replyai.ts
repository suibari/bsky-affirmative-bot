import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { AppBskyFeedPost } from "@atproto/api"; type Record = AppBskyFeedPost.Record;
import { getImageUrl, getLangStr, uniteDidNsidRkey } from "../bsky/util.js";
import { getBotContext } from "../util/botContext.js";
import { generateAffirmativeWord } from "@bsky-affirmative-bot/bot-brain";
import { Embed, GeminiScore, BADGE_DEF } from "@bsky-affirmative-bot/shared-configs";
import { MemoryService, botLabelerManager } from "@bsky-affirmative-bot/clients";
import { postContinuous } from "../bsky/postContinuous.js";
import { checkAndSendRoomInvitation } from "../bsky/roomInvitation.js";
import { MAX_LEVEL } from "../util/index.js";
import { getConcatProfiles } from "../bsky/getConcatProfiles.js";
import { parseEmbedPost } from "../bsky/parseEmbedPost.js";
import { followerMap } from "../bsky/followerManagement.js";
import { replyRandom } from "./replyrandom.js";


export async function replyAI(
    follower: ProfileView,
    event: CommitCreateEvent<"app.bsky.feed.post">,
    relatedPosts: string[],
    isSubscriber?: boolean,
) {
    const record = event.commit.record as Record;
    const uri = uniteDidNsidRkey(follower.did, event.commit.collection, event.commit.rkey);
    const cid = event.commit.cid;
    const langStr = getLangStr(record.langs);

    let result: GeminiScore | undefined;
    const text_user = record.text;
    const image = await getImageUrl(follower.did, record.embed);

    // 引用ポスト・リンク解析
    let embed: Embed | undefined = undefined;
    const embed_tmp = await parseEmbedPost(record);
    if (embed_tmp) {
        if (embed_tmp.profile_embed) {
            // 引用ポストの場合、フォロワーに含まれるかbot自身の投稿ならセット
            if (
                (embed_tmp.profile_embed?.did && followerMap.has(embed_tmp.profile_embed.did)) ||
                process.env.BSKY_DID === embed_tmp.profile_embed?.did // botの投稿を引用でも反応する
            ) {
                embed = embed_tmp;
                if (embed.image_embed) {
                    image.push(...embed.image_embed);
                }
            }
        } else if (embed_tmp.uri_embed) {
            // 外部リンクカードの場合、そのままセット
            embed = embed_tmp;
        }
    }

    // ポストテキストからURLを抽出（リンクカードがない場合）
    if (!embed?.uri_embed) {
        let textLinkUri: string | undefined;

        // facetsからリンクを抽出
        if (record.facets) {
            for (const facet of record.facets) {
                if (facet.features) {
                    for (const feature of facet.features) {
                        if (feature.$type === 'app.bsky.richtext.facet#link' && typeof (feature as any).uri === 'string') {
                            textLinkUri = (feature as any).uri;
                            break;
                        }
                    }
                }
                if (textLinkUri) break;
            }
        }

        if (textLinkUri) {
            if (!embed) embed = {};
            embed.uri_embed = textLinkUri;
        }
    }

    if (process.env.NODE_ENV === "development") {
        console.log("[DEBUG] user>>> " + text_user);
        console.log("[DEBUG] image: " + image?.map(img => img.image_url).join(", "));
        console.log("[DEBUG] lang: " + langStr);
        console.log(`[DEBUG] embed: ${embed?.text_embed}`)
    }

    try {
        // ユーザがいいねしてくれたポストを取得
        // const likedPost = await dbLikes.selectDb(follower.did, "liked_post") ?? undefined;
        const likeData = await MemoryService.getLike(follower.did);
        const likedPost = likeData?.liked_post;

        if (likedPost) {
            MemoryService.deleteLike(follower.did);
        }

        // 共通の趣味を持つフォロワーのポストを取得
        let followersFriend: { profile: ProfileView; post: string; uri: string } | undefined = undefined;
        followersFriend = await getFollowersFriend(text_user, follower.did);

        // Gemini生成
        result = await generateAffirmativeWord({
            follower,
            langStr,
            posts: [text_user, ...relatedPosts],
            likedByFollower: likedPost,
            image,
            followersFriend: followersFriend ? [followersFriend] : undefined,
            embed,
            isSubscriber,
            botContext: await getBotContext(),
        });

        // お気に入りポスト登録
        // dbPosts.insertDb(follower.did);
        // const prevScore = await dbPosts.selectDb(follower.did, "score") as number || 0;

        const prevPost = await MemoryService.getPost(follower.did);
        const prevScore = prevPost?.score || 0;

        if (result && result.score && prevScore < result.score && text_user.length > 0) { // 空ポスト除外
            await MemoryService.upsertPost({
                did: follower.did,
                post: record.text,
                comment: result.comment,
                score: result.score,
                uri: uri
            });
        }

        // 超ポジティブバッジ適用判定 (スコア 95 以上)
        let isNewMaxPositivityLevel = false;
        if (result && result.score && result.score >= 95) {
            try {
                // Ensure follower exists in DB first
                await MemoryService.ensureFollower(follower.did);

                // 1. ユーザーの現在の positivity_level を取得
                const followerData = await MemoryService.getFollower(follower.did);
                const currentLevel = followerData?.positivity_level || 0;

                if (currentLevel >= MAX_LEVEL) {
                    console.log(`[INFO][BADGE] User ${follower.did} already at MAX level, skipping badge update`);
                } else {
                    const nextLevel = currentLevel + 1;
                    const isNewMax = nextLevel === MAX_LEVEL;
                    const levelLabel = isNewMax ? 'Lv. MAX' : `Lv.${nextLevel}`;

                    console.log(`[INFO][BADGE] User ${follower.did} achieved score ${result.score}! Positivity Level Up: ${currentLevel} -> ${nextLevel}`);

                    const nextDef = BADGE_DEF.superPositiveLv(nextLevel, levelLabel);

                    // 2. 新しいレベルのバッジ定義をレーベラーに upsert
                    await botLabelerManager.upsertLabelDefinition(nextDef.id, nextDef.locales);

                    // 3. 新しいバッジを付与
                    await botLabelerManager.applyLabel(follower.did, nextDef.id, false);

                    // 4. 古いバッジがあれば剥奪
                    if (currentLevel > 0) {
                        const prevBadgeId = BADGE_DEF.superPositiveLv(currentLevel, '').id;
                        await botLabelerManager.applyLabel(follower.did, prevBadgeId, true).catch(err => {
                            console.error(`[WARN][BADGE] Failed to negate previous badge ${prevBadgeId} for ${follower.did}:`, err.message);
                        });
                    }

                    // 5. DB の positivity_level を更新
                    await MemoryService.updateFollower(follower.did, "positivity_level", nextLevel);
                    console.log(`[INFO][BADGE] Successfully applied badge ${nextDef.id} to ${follower.did}`);

                    if (isNewMax) isNewMaxPositivityLevel = true;
                }
            } catch (badgeErr: any) {
                console.error(`[ERROR][BADGE] Failed to apply positivity level badge for ${follower.did}:`, badgeErr.message);
            }
        }

        // ポスト
        const text_bot = result?.comment || "";
        await postContinuous(text_bot, { uri, cid, record }, undefined);

        // Lv. MAX 到達時の祝福リプライ
        if (isNewMaxPositivityLevel) {
            const displayName = follower.displayName || follower.handle;
            const maxText = langStr === "日本語"
                ? `${displayName}ちゃん、超ポジティブ Lv. MAXに到達したよ！🎉\n心からおめでとう！これからもよろしくね💖`
                : `Dear ${displayName}, you've reached Super-Positive Lv. MAX! 🎉\nCongratulations from the bottom of my heart! Let's keep going together💖`;
            await postContinuous(maxText, { uri, cid, record }, undefined);
        }

        // AIリプライ送信完了後、お部屋お誘い条件の判定と処理を非同期（バックグラウンド）で実行
        checkAndSendRoomInvitation(uri, cid, record).catch(err => {
            console.error(`[ERROR][ROOM_INVITE] checkAndSendRoomInvitation failed:`, err);
        });

        return result;
    } catch (e: any) {
        if (e.message === "HighMatchNum") {
            console.log(`[INFO][${follower.did}] Switched to replyRandom due to HighMatchNum (>= 10)`);
            await replyRandom(follower, event);
            return null;
        } else {
            console.warn(`[WARN][${follower.did}] replyAI failed, throwing to upper handler. Error:`, e.message);
            throw e;
        }
    }
}

async function getFollowersFriend(text_user: string, userDid: string) {
    // ベクトル類似検索で投稿者本人を除いた類似ポストを取得
    const similarPosts = await MemoryService.findSimilarPosts(text_user, userDid);
    if (similarPosts.length === 0) return undefined;

    const friendsProfiles = await getConcatProfiles({
        actors: similarPosts.map(p => p.did),
    });
    if (!friendsProfiles || friendsProfiles.length === 0) return undefined;

    const firstProfile = friendsProfiles[0] as ProfileView;
    const firstPost = similarPosts.find(p => p.did === firstProfile.did);

    return firstProfile && firstPost && firstPost.post && firstPost.uri
        ? { profile: firstProfile, post: firstPost.post, uri: firstPost.uri }
        : undefined;
}


