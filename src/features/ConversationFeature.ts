import { CommitCreateEvent } from "@skyware/jetstream";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { BotFeature, FeatureContext } from "./types";
import { logger, botBiothythmManager, followers } from "../index";
import { getSubscribersFromSheet } from "../api/gsheet";
import { isReplyOrMentionToMe, uniteDidNsidRkey, getImageUrl, getLangStr } from "../bsky/util";
import { dbReplies } from "../db";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { Content } from "@google/genai";
import { SQLite3 } from "../db/index";
import { Embed, GeminiResponseResult, UserInfoGemini } from "../types";
import { parseEmbedPost } from '../bsky/parseEmbedPost';
import { parseThread, ParsedThreadResult } from "../bsky/parseThread";
import { handleMode } from "./utils";
import retry from 'async-retry';
import { conversation } from "../gemini/conversation";
import { agent } from "../bsky/agent";
import { generateQuestionsAnswer } from "../gemini/generateQuestionsAnswer";
import { postContinuous } from "../bsky/postContinuous";
import { generateWhimsicalReply } from "../gemini/generateWhimsicalReply";
import { like } from "../bsky/like";

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
        dbReplies.insertOrUpdateDb(follower.did);
        dbReplies.updateDb(follower.did, "reply", record.text);
        dbReplies.updateDb(follower.did, "uri", uri);
        dbReplies.updateDb(follower.did, "isRead", 0);
        logger.addReply();
        console.log(`[INFO][${follower.did}] new reply to me, so memorized`);

        // 質問コーナー回答: 会話機能より優先
        if (await this.postReplyOfAnswer(event, follower, context.db)) {
            logger.addAnswer();
            botBiothythmManager.addAnswer();
            return;
        }

        // 定期ポストへのリプライ: 会話機能より優先
        if (await this.doWhimsicalPostReply(follower, event)) {
            return;
        }

        // サブスクライバー限定で会話機能発動する
        const subscribers = await getSubscribersFromSheet();
        if (subscribers.includes(follower.did)) {
            if (await this.handleConversation(event, follower, context.db) && logger.checkRPD()) {
                logger.addConversation();
                botBiothythmManager.addConversation();
                return;
            }
        }
    }

    // --- Conversation Logic ---
    private async handleConversation(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
        const did = event.did;
        const record = event.commit.record as Record;

        // 添付画像取得
        const image = await getImageUrl(follower.did, record.embed);

        // 引用
        let embed: Embed | undefined = undefined;
        const embed_tmp = await parseEmbedPost(record);
        if (embed_tmp && embed_tmp.profile_embed &&
            (
                followers.find(follower => follower.did === embed_tmp.profile_embed?.did) ||
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
        let history = (await db.selectDb(follower.did, "conv_history")) as Content[] | undefined;
        if (!history) history = [];  // undefinedなら空配列で初期化
        const conv_root_cid = await db.selectDb(follower.did, "conv_root_cid") as String;

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
            db,
            dbColumn: "last_conv_at",
            dbValue: new Date().toISOString(),
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

    private async waitAndGenReply(userinfo: UserInfoGemini, event: CommitCreateEvent<"app.bsky.feed.post">, db: SQLite3): Promise<GeminiResponseResult> {
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
        db.updateDb(userinfo.follower.did, "conv_history", JSON.stringify(new_history));
        db.updateDb(userinfo.follower.did, "conv_root_cid", rootCid);
        console.log(`[INFO][${userinfo.follower.did}] send coversation-result`);

        return final_text_bot;
    }

    // --- Question Logic ---
    private async postReplyOfAnswer(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, db: SQLite3) {
        const record = event.commit.record as Record;
        const langStr = getLangStr(record.langs);
        const uri = uniteDidNsidRkey(follower.did, event.commit.collection, event.commit.rkey);

        // 質問情報取得
        const { uriQuestionRoot, themeQuestion } = logger.getQuestionState();
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
        const rows = await db.selectRows(["did", "question_root_uri", "last_answered_at"]);
        const todaysAnswered = rows?.filter(row => row.question_root_uri === uriQuestionRoot);
        // * 回答済みなら早期リターン
        if (todaysAnswered?.some(row => row.did === follower.did)) {
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
        db.updateDb(follower.did, "question_root_uri", uriQuestionRoot);
        db.updateDb(follower.did, "last_answered_at", new Date().toISOString());
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
        const rootUriRef = logger.getWhimsicalPostRoot();

        // すでにリプライ済みかチェック
        const isReplied = await dbReplies.selectDb(follower.did, "isRead");

        // 最新のつぶやき対象かつ返信未処理かチェック
        // NOTE: つぶやき以外のポストに対してリプライしてもisRepliedがtrueになるので不完全
        if (rootUri === rootUriRef && isReplied != 1) {
            // リプライ生成
            const currentMood = botBiothythmManager.getMood;
            const result = await generateWhimsicalReply({
                follower,
                posts: [record.text],
                langStr,
            }, currentMood);

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
