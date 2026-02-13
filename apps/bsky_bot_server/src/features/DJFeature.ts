import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
import { BotFeature, FeatureContext } from "./types.js";
import { logger } from "../index.js";
import { DJ_TRIGGER, NICKNAMES_BOT } from "@bsky-affirmative-bot/shared-configs";
import { AppBskyFeedPost } from "@atproto/api"; type Record = AppBskyFeedPost.Record;
import { handleMode, isPast } from "./utils.js";
import { generateRecommendedSong } from "@bsky-affirmative-bot/bot-brain";
import { getLangStr, isReplyOrMentionToMe } from "../bsky/util.js";
import { UserInfoGemini, GeminiResponseResult } from "@bsky-affirmative-bot/shared-configs";
import { agent } from "../bsky/agent.js";
import { searchSpotifyTrack } from "@bsky-affirmative-bot/bot-brain";

export class DJFeature implements BotFeature {
    name = "DJ";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as Record;
        const text = (record.text || "").toLowerCase();

        const isCalled = isReplyOrMentionToMe(record) || NICKNAMES_BOT.some(elem => text.includes(elem.toLowerCase()));
        if (!isCalled) return false;

        if (!DJ_TRIGGER.some(trigger => text.includes(trigger.toLowerCase()))) return false;

        if (process.env.NODE_ENV !== "development") {
            if (!(await isPast(event, "last_dj_at", 5))) return false;
        }

        return true;
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const record = event.commit.record as Record;

        // ポスト収集
        const response = await agent.getAuthorFeed({
            actor: follower.did,
            limit: 100,
            filter: "posts_with_replies",
        });
        const posts = response.data.feed
            .filter(post => !post.reason) // リポスト除外
            .map(post => (post.post.record as Record).text);

        // 0要素目にDJリクエストポスト、1要素目以降に過去ポストをセット
        posts.unshift(record.text);

        const result = await handleMode(event, {
            dbColumn: "last_dj_at",
            dbValue: new Date().toISOString(),
            generateText: this.getSongLink.bind(this),
        },
            {
                follower,
                posts,
                langStr: getLangStr(record.langs),
            });

        if (result && await logger.checkRPD()) {
            await logger.addDJ();
        }
    }

    private async getSongLink(userinfo: UserInfoGemini): Promise<GeminiResponseResult> {
        const resultGemini = await generateRecommendedSong(userinfo);
        const resultSpotify = await searchSpotifyTrack({ artist: resultGemini.artist, track: resultGemini.title });

        const result =
            `${resultGemini.comment}
title: ${resultGemini.title}
artist: ${resultGemini.artist}

${resultSpotify?.url ?? "[Sorry, I couldn't find the song on Spotify...]"}`;

        return result;
    }
}
