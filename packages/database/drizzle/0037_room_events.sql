CREATE TABLE "affirmative_bot"."room_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"type" text NOT NULL,
	"detail" text,
	"is_read" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "room_events_unread_idx" ON "affirmative_bot"."room_events" USING btree ("is_read", "created_at");
