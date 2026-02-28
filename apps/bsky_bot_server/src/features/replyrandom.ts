import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { AppBskyFeedPost } from "@atproto/api"; type Record = AppBskyFeedPost.Record;
import { getLangStr, uniteDidNsidRkey } from "../bsky/util.js";
import { postContinuous } from "../bsky/postContinuous.js";
import { fetchSentiment } from "../util/negaposi.js";
import { HNY_WORDS, OHAYO_WORDS, OYASUMI_WORDS, OTSUKARE_WORDS } from "@bsky-affirmative-bot/shared-configs";

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

const CONDITIONS = [
    { keywords: HNY_WORDS, word: wordHny },
    { keywords: OHAYO_WORDS, word: wordMorning },
    { keywords: OYASUMI_WORDS, word: wordNight },
    { keywords: OTSUKARE_WORDS, word: wordGj },
];

export async function replyRandom(follower: ProfileView, event: CommitCreateEvent<"app.bsky.feed.post">) {
    let sentiment = 0;
    let wordSpecial;
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

    // 単語判定
    for (const condition of CONDITIONS) {
        for (const keyword of condition.keywords) {
            if (posttext.includes(keyword)) {
                wordSpecial = condition.word; // 一致するpathを返す
            }
        }
    }

    if (wordSpecial) {
        // あいさつ判定
        wordArray = wordSpecial;
    } else {
        // ネガポジフェッチ
        const negaposiData = await fetchSentiment([posttext]);
        sentiment = negaposiData.average_sentiments[0];

        // 感情分析
        if (langStr == "日本語") {
            if (sentiment <= -0.2) {
                wordArray = wordNeg;
            } else if (sentiment >= 0.2) {
                wordArray = wordPos;
            } else {
                wordArray = wordNrm;
            };
        } else {
            if (sentiment <= -0.05) {
                wordArray = wordNegEn;
            } else if (sentiment >= 0.05) {
                wordArray = wordPosEn;
            } else {
                wordArray = wordNrmEn;
            };
        }
    }

    let rand = Math.random();
    rand = Math.floor(rand * wordArray.length);
    const text_bot = wordArray[rand];
    const text_bot_replaced = text_bot.replace("${name}", follower.displayName ?? "");

    // ポスト
    await postContinuous(text_bot_replaced, { uri, cid, record });

    return null;
}
