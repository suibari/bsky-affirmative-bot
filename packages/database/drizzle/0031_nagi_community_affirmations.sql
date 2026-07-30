-- 「みんなで全肯定」用の匿名要約兼リースジョブ。
-- 作者DIDを主キーにして、同じ作者から同時に1件しか候補にならないことを保証する。

DO $$ BEGIN
  CREATE TYPE "nagi"."community_affirmation_state" AS ENUM (
    'pending',
    'processing',
    'posted',
    'rejected',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "nagi"."community_affirmations" (
  "author_did" text PRIMARY KEY,
  "source_uri" text NOT NULL,
  "source_cid" text NOT NULL,
  "summary_ja" text,
  "summary_en" text,
  "state" "nagi"."community_affirmation_state" DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "lease_expires_at" timestamp with time zone,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "next_eligible_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error" text,
  "model" text,
  "prompt_version" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "nagi_community_affirmations_source_idx"
  ON "nagi"."community_affirmations" ("source_uri", "source_cid");

CREATE INDEX IF NOT EXISTS "nagi_community_affirmations_ready_idx"
  ON "nagi"."community_affirmations" ("state", "next_attempt_at", "lease_expires_at");

CREATE INDEX IF NOT EXISTS "nagi_community_affirmations_eligible_idx"
  ON "nagi"."community_affirmations" ("next_eligible_at");
