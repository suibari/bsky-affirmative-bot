import { pgTable, text, integer, timestamp, jsonb, serial, pgSchema } from "drizzle-orm/pg-core";

export const affirmativeBotSchema = pgSchema("affirmative_bot");

export const followers = affirmativeBotSchema.table("followers", {
  did: text("did").primaryKey(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  is_u18: integer("is_u18").default(0),
  is_ai_only: integer("is_ai_only").default(0),
  last_uranai_at: timestamp("last_uranai_at"),
  reply_freq: integer("reply_freq").default(100),
  last_conv_at: timestamp("last_conv_at"),
  conv_history: jsonb("conv_history"),
  conv_root_cid: text("conv_root_cid"),
  last_analyze_at: timestamp("last_analyze_at"),
  last_cheer_at: timestamp("last_cheer_at"),
  last_dj_at: timestamp("last_dj_at"),
  user_anniv_name: text("user_anniv_name"),
  user_anniv_date: text("user_anniv_date"),
  last_anniv_execed_at: timestamp("last_anniv_execed_at"),
  last_anniv_registered_at: timestamp("last_anniv_registered_at"),
  last_status_at: timestamp("last_status_at"),
  question_root_uri: text("question_root_uri"),
  last_answered_at: timestamp("last_answered_at"),
  last_recap_at: timestamp("last_recap_at"),
  is_diary: integer("is_diary").default(0),
});

export const posts = affirmativeBotSchema.table("posts", {
  did: text("did").primaryKey(),
  post: text("post"),
  score: integer("score"),
  updated_at: timestamp("updated_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  uri: text("uri"),
  comment: text("comment"),
});

export const likes = affirmativeBotSchema.table("likes", {
  did: text("did").primaryKey(),
  liked_post: text("liked_post"),
  uri: text("uri"),
  updated_at: timestamp("updated_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const replies = affirmativeBotSchema.table("replies", {
  did: text("did").primaryKey(),
  reply: text("reply"),
  uri: text("uri"),
  isRead: integer("isRead").default(0),
  updated_at: timestamp("updated_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const bot_state = affirmativeBotSchema.table("bot_state", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const affirmations = affirmativeBotSchema.table("affirmations", {
  id: serial("id").primaryKey(),
  did: text("did"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const interaction = affirmativeBotSchema.table("interaction", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  did: text("did"),
  details: jsonb("details"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

