CREATE TABLE "affirmative_bot"."repo_write_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"action" text NOT NULL,
	"points" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "repo_write_points_did_created_idx" ON "affirmative_bot"."repo_write_points" USING btree ("did", "created_at");
