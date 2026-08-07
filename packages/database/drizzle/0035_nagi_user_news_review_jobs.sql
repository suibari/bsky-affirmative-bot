CREATE TYPE "nagi"."news_review_state" AS ENUM(
  'pending',
  'processing',
  'approved',
  'rejected',
  'failed',
  'cancelled'
);
--> statement-breakpoint
CREATE TABLE "nagi"."news_review_jobs" (
  "news_uri" text NOT NULL,
  "news_cid" text NOT NULL,
  "did" text NOT NULL,
  "normalized_url" text NOT NULL,
  "status" "nagi"."news_review_state" DEFAULT 'pending' NOT NULL,
  "reason_code" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  CONSTRAINT "news_review_jobs_news_uri_news_cid_pk" PRIMARY KEY("news_uri", "news_cid")
);
--> statement-breakpoint
CREATE INDEX "nagi_news_review_jobs_pending_idx" ON "nagi"."news_review_jobs" USING btree ("status", "requested_at");
--> statement-breakpoint
CREATE INDEX "nagi_news_review_jobs_did_idx" ON "nagi"."news_review_jobs" USING btree ("did", "requested_at");
