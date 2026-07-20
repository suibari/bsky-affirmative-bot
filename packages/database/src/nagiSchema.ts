import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const nagiSchema = pgSchema("nagi");
export const notificationType = nagiSchema.enum("notification_type", [
  "reply",
  "reaction",
  "mention",
]);
export const botJobState = nagiSchema.enum("bot_job_state", [
  "pending",
  "processing",
  "posted",
  "failed",
]);

export const nagiActors = nagiSchema.table("actors", {
  did: text("did").primaryKey(),
  handle: text("handle").notNull(),
  pdsUrl: text("pds_url").notNull(),
  status: text("status").default("active").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const nagiPosts = nagiSchema.table(
  "posts",
  {
    uri: text("uri").primaryKey(),
    cid: text("cid").notNull(),
    rkey: text("rkey").notNull(),
    did: text("did").notNull(),
    text: text("text").notNull(),
    facets: jsonb("facets"),
    langs: jsonb("langs"),
    recordJson: jsonb("record_json"),
    replyRootUri: text("reply_root_uri"),
    replyParentUri: text("reply_parent_uri"),
    embedImages: jsonb("embed_images"),
    quoteUri: text("quote_uri"),
    quoteValid: boolean("quote_valid").default(false).notNull(),
    repoRev: text("repo_rev"),
    recordCreatedAt: timestamp("record_created_at", {
      withTimezone: true,
    }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("nagi_posts_timeline_idx").on(t.indexedAt, t.uri),
    index("nagi_posts_parent_idx").on(t.replyParentUri),
    index("nagi_posts_actor_idx").on(t.did, t.indexedAt),
  ],
);
export const nagiPostScores = nagiSchema.table("post_scores", {
  postUri: text("post_uri").primaryKey(),
  score: integer("score").notNull(),
  botReplyUri: text("bot_reply_uri"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const nagiReactions = nagiSchema.table(
  "reactions",
  {
    uri: text("uri").primaryKey(),
    cid: text("cid").notNull(),
    did: text("did").notNull(),
    subjectUri: text("subject_uri").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("nagi_reaction_actor_subject_emoji_idx").on(
      t.did,
      t.subjectUri,
      t.emoji,
    ),
    index("nagi_reaction_subject_idx").on(t.subjectUri),
  ],
);
export const nagiProfiles = nagiSchema.table("profiles", {
  did: text("did").primaryKey(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  avatarCid: text("avatar_cid"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  indexedAt: timestamp("indexed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const nagiNotifications = nagiSchema.table(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipientDid: text("recipient_did").notNull(),
    type: notificationType("type").notNull(),
    actorDid: text("actor_did").notNull(),
    subjectUri: text("subject_uri").notNull(),
    reasonUri: text("reason_uri").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("nagi_notification_reason_idx").on(t.recipientDid, t.reasonUri),
    index("nagi_notification_inbox_idx").on(t.recipientDid, t.createdAt),
  ],
);
export const nagiTranslations = nagiSchema.table(
  "translations",
  {
    postUri: text("post_uri").notNull(),
    targetLang: text("target_lang").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.postUri, t.targetLang] })],
);
export const nagiIngestState = nagiSchema.table("ingest_state", {
  key: text("key").primaryKey(),
  cursor: bigint("cursor", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const nagiProcessedEvents = nagiSchema.table("processed_events", {
  id: text("id").primaryKey(),
  timeUs: bigint("time_us", { mode: "number" }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const nagiBotReplyJobs = nagiSchema.table(
  "bot_reply_jobs",
  {
    sourceUri: text("source_uri").primaryKey(),
    sourceCid: text("source_cid").notNull(),
    authorDid: text("author_did").notNull(),
    recordJson: jsonb("record_json").notNull(),
    state: botJobState("state").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    replyUri: text("reply_uri"),
    score: integer("score"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("nagi_bot_jobs_ready_idx").on(t.state, t.nextAttemptAt)],
);
