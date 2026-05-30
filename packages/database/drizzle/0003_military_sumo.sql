ALTER TABLE "affirmative_bot"."followers" ADD COLUMN "last_room_visit_at" timestamp;--> statement-breakpoint
ALTER TABLE "affirmative_bot"."followers" ADD COLUMN "room_invite_sent" integer DEFAULT 0;