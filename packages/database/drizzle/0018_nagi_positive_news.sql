ALTER TABLE "nagi"."posts" ADD COLUMN "quote_cid" text;

CREATE TABLE "nagi"."news" (
  "uri" text PRIMARY KEY NOT NULL, "cid" text NOT NULL, "rkey" text NOT NULL,
  "did" text NOT NULL, "article_id" text NOT NULL, "url" text NOT NULL,
  "normalized_url" text NOT NULL, "title_ja" text NOT NULL, "source_name" text,
  "source_url" text, "published_at" timestamp with time zone, "langs" jsonb,
  "record_created_at" timestamp with time zone NOT NULL,
  "indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX "nagi_news_article_id_idx" ON "nagi"."news" USING btree ("article_id");
CREATE INDEX "nagi_news_normalized_url_idx" ON "nagi"."news" USING btree ("normalized_url");
CREATE INDEX "nagi_news_feed_idx" ON "nagi"."news" USING btree ("indexed_at", "uri");

CREATE TABLE "nagi"."news_approvals" (
  "news_uri" text NOT NULL, "news_cid" text NOT NULL, "status" text NOT NULL,
  "reason_code" text, "bot_comment_ja" text, "title_en" text, "bot_comment_en" text,
  "snapshot_article_id" text, "snapshot_url" text, "snapshot_title_ja" text,
  "snapshot_source_name" text, "snapshot_source_url" text,
  "snapshot_published_at" timestamp with time zone, "snapshot_created_at" timestamp with time zone,
  "model" text, "prompt_version" text,
  "reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "hidden_at" timestamp with time zone,
  CONSTRAINT "news_approvals_news_uri_news_cid_pk" PRIMARY KEY("news_uri", "news_cid")
);
CREATE TABLE "nagi"."news_screening" (
  "cache_key" text PRIMARY KEY NOT NULL, "article_id" text NOT NULL,
  "decision" text NOT NULL, "reason_code" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "nagi"."news_update_runs" (
  "slot" timestamp with time zone PRIMARY KEY NOT NULL, "status" text NOT NULL,
  "published_count" integer DEFAULT 0 NOT NULL, "retry_count" integer DEFAULT 0 NOT NULL,
  "newsdata_credits" integer DEFAULT 0 NOT NULL,
  "last_error" text, "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
