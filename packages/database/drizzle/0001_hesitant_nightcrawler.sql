CREATE SCHEMA "affirmative_bot";
--> statement-breakpoint
CREATE TABLE "affirmative_bot"."affirmations" (
	"id" serial PRIMARY KEY NOT NULL,
	"did" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affirmative_bot"."bot_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affirmative_bot"."followers" (
	"did" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_u18" integer DEFAULT 0,
	"is_ai_only" integer DEFAULT 0,
	"last_uranai_at" timestamp,
	"reply_freq" integer DEFAULT 100,
	"last_conv_at" timestamp,
	"conv_history" jsonb,
	"conv_root_cid" text,
	"last_analyze_at" timestamp,
	"last_cheer_at" timestamp,
	"last_dj_at" timestamp,
	"user_anniv_name" text,
	"user_anniv_date" text,
	"last_anniv_execed_at" timestamp,
	"last_anniv_registered_at" timestamp,
	"last_status_at" timestamp,
	"question_root_uri" text,
	"last_answered_at" timestamp,
	"last_recap_at" timestamp,
	"is_diary" integer DEFAULT 0,
	"is_anniv" integer DEFAULT 1,
	"last_whimsical_responded_uri" text
);
--> statement-breakpoint
CREATE TABLE "affirmative_bot"."interaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"did" text,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affirmative_bot"."likes" (
	"did" text PRIMARY KEY NOT NULL,
	"liked_post" text,
	"uri" text,
	"updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affirmative_bot"."posts" (
	"did" text PRIMARY KEY NOT NULL,
	"post" text,
	"score" integer,
	"updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"uri" text,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "affirmative_bot"."replies" (
	"did" text PRIMARY KEY NOT NULL,
	"reply" text,
	"uri" text,
	"isRead" integer DEFAULT 0,
	"updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
