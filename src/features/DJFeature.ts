import { CommitCreateEvent } from "@skyware/jetstream";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { BotFeature, FeatureContext } from "./types";
import { logger, botBiothythmManager } from "../index";
import { DJ_TRIGGER, NICKNAMES_BOT } from "../config";
import { Record } from "@atproto/api/dist/client/types/app/bsky/feed/post";
import { handleMode, isPast } from "./utils";
import { generateRecommendedSong } from "../gemini/generateRecommendedSong";
import { getLangStr, isReplyOrMentionToMe } from "../bsky/util";
import { UserInfoGemini, GeminiResponseResult } from "../types";
import { agent } from "../bsky/agent";
import { searchSpotifyTrack } from "../api/spotify";

export class DJFeature implements BotFeature {
    name = "DJ";

    async shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean> {
        const record = event.commit.record as Record;
        const text = (record.text || "").toLowerCase();

        const isCalled = isReplyOrMentionToMe(record) || NICKNAMES_BOT.some(elem => text.includes(elem.toLowerCase()));
        if (!isCalled) return false;

        if (!DJ_TRIGGER.some(trigger => text.includes(trigger.toLowerCase()))) return false;

        if (process.env.NODE_ENV !== "development") {
            if (!(await isPast(event, context.db, "last_dj_at", 5))) return false;
        }

        return true;
    }

    async handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void> {
        const record = event.commit.record as Record;
        const { db } = context;

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
            db,
            dbColumn: "last_dj_at",
            dbValue: new Date().toISOString(),
            generateText: this.getSongLink.bind(this),
        },
            {
                follower,
                posts,
                langStr: getLangStr(record.langs),
            });

        if (result && logger.checkRPD()) {
            logger.addDJ();
            botBiothythmManager.addDJ();
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
