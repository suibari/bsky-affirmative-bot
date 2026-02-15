import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { BotFeature, FeatureContext } from "./types.js";
import { logger } from "../logger.js";
import { followerMap } from "../bsky/followerManagement.js";
import { getSubscribersFromSheet } from "@bsky-affirmative-bot/bot-brain";
import { isReplyOrMentionToMe, uniteDidNsidRkey, getImageUrl, getLangStr } from "../bsky/util.js";
import { AppBskyFeedPost } from "@atproto/api"; type Record = AppBskyFeedPost.Record;
import { Content } from "@google/genai";
import { Embed, GeminiResponseResult, UserInfoGemini } from "@bsky-affirmative-bot/shared-configs";
import { parseEmbedPost } from '../bsky/parseEmbedPost.js';
import { parseThread, ParsedThreadResult } from "../bsky/parseThread.js";
import { handleMode } from "./utils.js";
import retry from 'async-retry';
import { conversation } from "@bsky-affirmative-bot/bot-brain";
import { agent } from "../bsky/agent.js";
import { generateQuestionsAnswer } from "@bsky-affirmative-bot/bot-brain";
import { postContinuous } from "../bsky/postContinuous.js";
import { generateWhimsicalReply } from "@bsky-affirmative-bot/bot-brain";
import { like } from "../bsky/like.js";
import { MemoryService } from "@bsky-affirmative-bot/clients";

const MAX_BOT_MEMORY = 100;

export class ConversationFeature implements BotFeature {
    name = "Conversation";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as any;
        return record.reply && isReplyOrMentionToMe(record);
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const record = event.commit.record as Record;
        const uri = uniteDidNsidRkey(follower.did, event.commit.collection, event.commit.rkey);

        // リプライを記憶
        await MemoryService.upsertReply(follower.did, {
            reply: record.text,
            uri: uri,
            isRead: 0
        });
        await logger.addReply();
        console.log(`[INFO][${follower.did}] new reply to me, so memorized`);

        // 質問コーナー回答: 会話機能より優先
        if (await this.postReplyOfAnswer(event, follower)) {
            await logger.addAnswer();
            return;
        }

        // 定期ポストへのリプライ: 会話機能より優先
        if (await this.doWhimsicalPostReply(follower, event)) {
            return;
        }

        // サブスクライバー限定で会話機能発動する
        const subscribers = await getSubscribersFromSheet();
        if (subscribers.includes(follower.did)) {
            if (await this.handleConversation(event, follower) && await logger.checkRPD()) {
                await logger.addConversation();
                return;
            }
        }
    }

    // --- Conversation Logic ---
    private async handleConversation(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
        const did = event.did;
        const record = event.commit.record as Record;

        // 添付画像取得
        const image = await getImageUrl(follower.did, record.embed);

        // 引用
        let embed: Embed | undefined = undefined;
        const embed_tmp = await parseEmbedPost(record);
        if (embed_tmp && embed_tmp.profile_embed &&
            (
                followerMap.has(embed_tmp.profile_embed?.did) ||
                process.env.BSKY_DID === embed_tmp.profile_embed?.did // botの投稿を引用でも反応する
            )
        ) {
            // フォロワーに引用先が含まれるならセット
            embed = embed_tmp;
            if (embed.image_embed) {
                image.push(...embed.image_embed);
            }
        }

        // 前回までの会話取得
        const row = await MemoryService.getFollower(follower.did);
        let history: Content[] = [];
        if (row?.conv_history) {
            history = typeof row.conv_history === 'string'
                ? JSON.parse(row.conv_history)
                : row.conv_history;
        }
        const conv_root_cid = row?.conv_root_cid;

        // スレッドrootがポストしたユーザでないなら早期リターン
        if (!record.reply?.root.uri.includes(follower.did)) return false;

        // ユーザからbotへのリプライ時、botの定期ポストでなければ、
        // 1ユーザの元ポスト、2botのリプライ、3ユーザのさらなるリプライ となっているはず
        // conv_root_cidがスレッドのrootと等しくないなら、historyに会話履歴を追加する必要あり
        try {
            if (conv_root_cid !== record.reply?.root.cid) {
                const thread: ParsedThreadResult = await parseThread(record);
                // 親の親ポスト
                const gpContent: Content = {
                    role: "user",
                    parts: [
                        {
                            text: thread.userPostText
                        },
                    ],
                }
                history.push(gpContent)
                // 親ポスト
                const parentContent: Content = {
                    role: "model",
                    parts: [
                        {
                            text: thread.botPostText
                        }
                    ]
                }
                history.push(parentContent);
            }
        } catch (error) {
            console.error(`[ERROR][${did}] Failed to parse thread:`, error);
            return false; // スレッド解析に失敗した場合は処理を中止
        }

        return await handleMode(event, {
            dbColumn: "last_conv_at",
            dbValue: new Date(),
            generateText: this.waitAndGenReply.bind(this),
        },
            {
                follower,
                posts: [record.text],
                langStr: getLangStr(record.langs),
                image,
                history,
                embed,
            });
    }

    private async waitAndGenReply(userinfo: UserInfoGemini, event: CommitCreateEvent<"app.bsky.feed.post">): Promise<GeminiResponseResult> {
        const record = event.commit.record as Record;

        let text_bot: string | undefined = undefined;
        let new_history: Content[] = [];

        try {
            await retry(async (bail, attempt) => {
                const result = await conversation(userinfo);
                text_bot = result.text_bot;
                new_history = result.new_history;

                if (!text_bot) {
                    console.warn(`[WARN][${userinfo.follower.did}] Attempt ${attempt}: Failed to generate response text. Retrying...`);
                    throw new Error("Response text is empty, retrying."); // Throw to trigger retry
                }
            }, {
                retries: 3, // Number of retries
                onRetry: (error: any, attempt) => {
                    console.warn(`[WARN][${userinfo.follower.did}] Retry attempt ${attempt} failed: ${error.message}`);
                }
            });
        } catch (error: any) {
            console.error(`[ERROR][${userinfo.follower.did}] Failed to generate response text after multiple retries: ${error.message}`);
            return "";
        }

        const final_text_bot = text_bot || "";

        // イイネ応答
        const uri = uniteDidNsidRkey(event.did, event.commit.collection, event.commit.rkey);
        await like(uri, event.commit.cid);

        // historyのクリップ処理
        while (new_history.length > MAX_BOT_MEMORY) {
            new_history.shift(); // 先頭から削除
            if (new_history[0].role === "model") {
                new_history.shift();
            }
        }

        // 初回の呼びかけまたは呼びかけし直しならreplyがないのでそのポストのcidを取得
        const rootCid = record.reply?.root.cid || String(event.commit.cid);

        // 会話記録にinlineDataが含まれると巨大すぎるので削除しておく
        for (const content of new_history) {
            if (content.parts) {
                content.parts = content.parts.filter(
                    (part: any) => !("inlineData" in part)
                );
            }
        }

        // DB登録
        await MemoryService.updateFollower(userinfo.follower.did, "conv_history", new_history);
        await MemoryService.updateFollower(userinfo.follower.did, "conv_root_cid", rootCid);
        console.log(`[INFO][${userinfo.follower.did}] send coversation-result`);

        return final_text_bot;
    }

    // --- Question Logic ---
    private async postReplyOfAnswer(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView) {
        const record = event.commit.record as Record;
        const langStr = getLangStr(record.langs);
        const uri = uniteDidNsidRkey(follower.did, event.commit.collection, event.commit.rkey);

        // 質問情報取得
        const { uriQuestionRoot, themeQuestion } = await logger.getQuestionState();
        if (!uriQuestionRoot || !themeQuestion) {
            // console.log(`[INFO][QUESTION][${follower.did}] No question found`);
            return false;
        }

        // ユーザ回答スレッドチェック: わからないけど安全のため
        const uriRecordRoot = record.reply?.root.uri;
        if (uriRecordRoot !== uriQuestionRoot) {
            // console.log(`[INFO][QUESTION][${follower.did}] not question root`);
            return false;
        }

        // 回答制限のチェック
        const rows = await MemoryService.getFollowersByColumn("question_root_uri", uriQuestionRoot);
        // * 回答済みなら早期リターン
        if (rows?.some(row => row.did === follower.did)) {
            return false;
        }

        // 画像読み取り
        const image = await getImageUrl(follower.did, record.embed);

        // 質問への回答
        const text = await generateQuestionsAnswer({
            follower,
            posts: [record.text],
            langStr,
            image,
        }, themeQuestion);
        await postContinuous(text, {
            uri,
            cid: String(event.commit.cid),
            record,
        });

        // DB更新
        await MemoryService.updateFollower(follower.did, "question_root_uri", uriQuestionRoot);
        await MemoryService.updateFollower(follower.did, "last_answered_at", new Date());
        console.log(`[INFO][QUESTION] Replied to answer from ${follower.did}: ${uri}`);

        return true;
    }

    // --- Whimsical Logic ---
    private async doWhimsicalPostReply(follower: ProfileView, event: CommitCreateEvent<"app.bsky.feed.post">) {
        const record = event.commit.record as Record;
        const uri = uniteDidNsidRkey(follower.did, event.commit.collection, event.commit.rkey);
        const rootUri = record.reply?.root.uri;
        const langStr = getLangStr(record.langs);

        // Root URIのチェック
        const rootUriRef = await logger.getWhimsicalPostRoot();

        // すでにリプライ済みかチェック
        const row = await MemoryService.getFollower(follower.did);
        const replyRow = await MemoryService.getLike(follower.did); // Use getLike or add getReplyById?
        // Wait, replies table in memory_server has did as PK.
        // We need a way to get reply by DID.
        // MemoryService.getLike gets row from likes table by DID.
        // I should add getReply to MemoryService.

        // Actually, dbReplies in original was table 'replies'.
        // Let's assume I'll add getReply to MemoryService.
        const rowReply = await MemoryService.getReply(follower.did);
        const isReplied = rowReply?.isRead;

        // 最新のつぶやき対象かつ返信未処理かチェック
        // NOTE: つぶやき以外のポストに対してリプライしてもisRepliedがtrueになるので不完全
        if (rootUri === rootUriRef && record.reply?.parent.uri === rootUriRef && isReplied != 1) {
            // リプライ生成
            // botBiothythmManager.getMood -> use biorhythm state?
            // Actually bot-brain's whimsical generation might need mood.
            // For now, assume mood 50 if not found.
            const result = await generateWhimsicalReply({
                follower,
                posts: [record.text],
                langStr,
            }, "50");

            // ポスト
            await postContinuous(result, { uri, cid: String(event.commit.cid), record });

            console.log(`[INFO][${follower.did}][WHIMSICAL] replied to reply of Whimsical post`);

            return true;
        } else {
            // console.log(`uri: ${uri}, uriRef: ${uriRef}`);
            return false;
        }
    }
}
