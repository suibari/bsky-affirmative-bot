CREATE TABLE "affirmative_bot"."biorhythm_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"mood" text NOT NULL,
	"energy" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affirmative_bot"."subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_id" text,
	"did" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_discord_id_unique" UNIQUE("discord_id"),
	CONSTRAINT "subscribers_did_unique" UNIQUE("did")
);
--> statement-breakpoint
ALTER TABLE "affirmative_bot"."followers" ADD COLUMN "positivity_level" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "affirmative_bot"."followers" ADD COLUMN "current_title_ja" text;--> statement-breakpoint
ALTER TABLE "affirmative_bot"."followers" ADD COLUMN "current_title_en" text;