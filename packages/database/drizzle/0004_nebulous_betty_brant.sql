CREATE TABLE "affirmative_bot"."gifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'new' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affirmative_bot"."biorhythm_history" ADD COLUMN "mood_en" text;