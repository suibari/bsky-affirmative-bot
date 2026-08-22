CREATE TABLE IF NOT EXISTS "affirmative_bot"."bot_memory_pronunciations" (
  "surface" text PRIMARY KEY,
  "spoken_form" text,
  "kind" text NOT NULL,
  "status" text NOT NULL,
  "origin" text NOT NULL,
  "evidence_count" integer DEFAULT 1 NOT NULL,
  "conflict_count" integer DEFAULT 0 NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bot_memory_pronunciation_kind_check"
    CHECK ("kind" IN ('work', 'proper_noun')),
  CONSTRAINT "bot_memory_pronunciation_status_check"
    CHECK ("status" IN ('active', 'ignored', 'disabled')),
  CONSTRAINT "bot_memory_pronunciation_origin_check"
    CHECK ("origin" IN ('auto', 'manual')),
  CONSTRAINT "bot_memory_pronunciation_spoken_form_check"
    CHECK (("status" = 'active' AND "spoken_form" IS NOT NULL)
      OR ("status" = 'ignored' AND "spoken_form" IS NULL)
      OR "status" = 'disabled')
);

CREATE INDEX IF NOT EXISTS "bot_memory_pronunciation_status_idx"
  ON "affirmative_bot"."bot_memory_pronunciations" ("status", "updated_at");

CREATE TABLE IF NOT EXISTS "affirmative_bot"."bot_memory_pronunciation_scans" (
  "impression_id" integer PRIMARY KEY
    REFERENCES "affirmative_bot"."bot_memory_impressions"("id") ON DELETE CASCADE,
  "scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "affirmative_bot"."bot_memory_pronunciations"
  ("surface", "spoken_form", "kind", "status", "origin")
VALUES ('攻殻機動隊', 'コウカク、キドウタイ', 'work', 'active', 'manual')
ON CONFLICT ("surface") DO NOTHING;
