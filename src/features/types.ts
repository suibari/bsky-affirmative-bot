import { CommitCreateEvent } from "@skyware/jetstream";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { SQLite3 } from "../db";

export interface FeatureContext {
    db: SQLite3;
}

export interface BotFeature {
    name: string;
    shouldHandle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<boolean>;
    handle(event: CommitCreateEvent<"app.bsky.feed.post">, follower: ProfileView, context: FeatureContext): Promise<void>;
}
