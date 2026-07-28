DO $$ BEGIN
  CREATE TYPE "nagi"."ai_reply_mode" AS ENUM ('ai', 'template');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "nagi"."bot_reply_jobs"
  ADD COLUMN IF NOT EXISTS "generation_mode" "nagi"."ai_reply_mode",
  ADD COLUMN IF NOT EXISTS "limit_reason" text,
  ADD COLUMN IF NOT EXISTS "mode_decided_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "nagi_bot_jobs_ai_quota_idx"
  ON "nagi"."bot_reply_jobs" ("author_did", "generation_mode", "mode_decided_at");

CREATE TABLE IF NOT EXISTS "nagi"."ai_reply_requests" (
  "id" bigserial PRIMARY KEY,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "nagi_ai_reply_requests_time_idx"
  ON "nagi"."ai_reply_requests" ("requested_at");
