-- 未サインイン投稿の正本は端末の IndexedDB に置く。この表は botたんの返信を生成し、
-- 端末が受け取るまでの短命な作業領域だけを担う。DID・公開 URI・生のアクセストークンは持たない。
CREATE TABLE IF NOT EXISTS "nagi"."guest_affirmation_jobs" (
  "id" uuid PRIMARY KEY,
  "access_token_hash" text NOT NULL,
  "text" text NOT NULL,
  "language" text NOT NULL,
  "state" "nagi"."bot_job_state" DEFAULT 'pending' NOT NULL,
  "reply" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "lease_expires_at" timestamp with time zone,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error" text,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "nagi_guest_affirmation_jobs_ready_idx"
  ON "nagi"."guest_affirmation_jobs" ("state", "next_attempt_at", "lease_expires_at");
CREATE INDEX IF NOT EXISTS "nagi_guest_affirmation_jobs_expiry_idx"
  ON "nagi"."guest_affirmation_jobs" ("expires_at");
