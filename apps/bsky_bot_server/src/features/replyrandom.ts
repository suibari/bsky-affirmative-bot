import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { AppBskyFeedPost } from "@atproto/api"; type Record = AppBskyFeedPost.Record;
import { getLangStr, uniteDidNsidRkey } from "../bsky/util.js";
import { postContinuous } from "../bsky/postContinuous.js";
import { classifySentimentOllama, selectTemplateOllama, translateTemplateOllama } from "../util/ollamaSentiment.js";

// JSON imports
import wordNeg from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_negative.json" with { type: "json" };
import wordNrm from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_normal.json" with { type: "json" };
import wordPos from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_positive.json" with { type: "json" };
import wordNegEn from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_negative_en.json" with { type: "json" };
import wordNrmEn from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_normal_en.json" with { type: "json" };
import wordPosEn from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_positive_en.json" with { type: "json" };
import wordHny from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_hny.json" with { type: "json" };
import wordMorning from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_morning.json" with { type: "json" };
import wordNight from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_night.json" with { type: "json" };
import wordGj from "@bsky-affirmative-bot/shared-configs/json/affirmativeword_gj.json" with { type: "json" };

export async function replyRandom(follower: ProfileView, event: CommitCreateEvent<"app.bsky.feed.post">) {
    let wordArray: string[] = [];

    const record = event.commit.record as Record;
    const uri = uniteDidNsidRkey(follower.did, event.commit.collection, event.commit.rkey);
    const cid = event.commit.cid;
    const posttext = record.text;
    const langStr = getLangStr(record.langs);

    if (process.env.NODE_ENV === "development") {
        console.log("[DEBUG] user>>> " + posttext);
        console.log("[DEBUG] lang: " + langStr);
    }

    // Step 1: 7カテゴリ分類（おはよう/おやすみ/お疲れ/新年を含む）
    const label = await classifySentimentOllama(posttext);

    if (process.env.NODE_ENV === "development") {
        console.log("[DEBUG] label: " + label);
    }

    // Step 2: カテゴリに応じた定型文セットを選択
    // 特殊カテゴリは言語問わず共通セット、感情カテゴリは言語別セット
    let candidateArray: string[];
    switch (label) {
        case "morning":  candidateArray = wordMorning; break;
        case "night":    candidateArray = wordNight;   break;
        case "gj":       candidateArray = wordGj;      break;
        case "hny":      candidateArray = wordHny;     break;
        case "negative": candidateArray = langStr === "日本語" ? wordNeg   : wordNegEn; break;
        case "positive": candidateArray = langStr === "日本語" ? wordPos   : wordPosEn; break;
        default:         candidateArray = langStr === "日本語" ? wordNrm   : wordNrmEn;
    }

    // Step 3: ollama が最適な1件を選択
    const selectedIdx = await selectTemplateOllama(candidateArray, posttext);
    wordArray = [candidateArray[selectedIdx]];

    // Step 4: 非日英の場合は選んだ定型文をポストの言語に翻訳
    if (langStr !== "日本語" && langStr !== "English") {
        const translated = await translateTemplateOllama(candidateArray[selectedIdx], langStr);
        wordArray = [translated];
    }

    let rand = Math.random();
    rand = Math.floor(rand * wordArray.length);
    const text_bot = wordArray[rand];
    const text_bot_replaced = text_bot.replace("${name}", follower.displayName ?? "");

    // ポスト
    await postContinuous(text_bot_replaced, { uri, cid, record });

    return null;
}
