ALTER TABLE "affirmative_bot"."followers" ADD COLUMN "room_badge_pending" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "affirmative_bot"."followers" ADD COLUMN "regular_level" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "affirmative_bot"."followers" ADD COLUMN "last_regular_badge_at" timestamp;
