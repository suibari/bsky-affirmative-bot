import { CommitCreateEvent } from "@skyware/jetstream";
import { AppBskyActorDefs } from "@atproto/api"; type ProfileView = AppBskyActorDefs.ProfileView;
export interface FeatureContext {
    isSubscriber: boolean;      // active のみ（課金支援者）
    isCommunityMember: boolean; // active + discord_only（Discordコミュニティメンバー）
}

export interface BotFeature {
    name: string;
    handlesOwnLogging?: boolean;
    shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean>;
    handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void>;
}
