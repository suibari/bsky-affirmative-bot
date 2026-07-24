-- botたんの自動分析（プロフィールの「ひとこと」吹き出し）。
--   nagi.actor_analyses … did 単位で最新の分析本文（ja/en）を保持。
--   nagi.analysis_jobs   … 分析生成のリースキュー（bot_reply_jobs と同型）。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。
-- state 列は既存の nagi.bot_job_state enum を流用する（0012_nagi.sql で定義済み）。

CREATE TABLE IF NOT EXISTS "nagi"."actor_analyses" (
	"did" text PRIMARY KEY NOT NULL,
	"analysis_ja" text NOT NULL,
	"analysis_en" text NOT NULL,
	"source" text NOT NULL,
	"post_count_at" integer,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "nagi"."analysis_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"source" text NOT NULL,
	"post_count_at" integer,
	"state" "nagi"."bot_job_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "nagi_analysis_jobs_ready_idx" ON "nagi"."analysis_jobs" USING btree ("state","next_attempt_at");
