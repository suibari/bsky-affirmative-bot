CREATE TABLE IF NOT EXISTS "affirmative_bot"."bot_memory_impressions" (
  "id" serial PRIMARY KEY,
  "document_id" integer NOT NULL REFERENCES "affirmative_bot"."bot_memory_documents"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "label" text NOT NULL,
  "relation" text NOT NULL,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bot_memory_impression_kind_check" CHECK ("kind" IN ('work', 'word')),
  CONSTRAINT "bot_memory_impression_relation_check" CHECK ("relation" IN ('recommended', 'liked', 'discussed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "bot_memory_impression_document_label_idx"
  ON "affirmative_bot"."bot_memory_impressions" ("document_id", "label");
CREATE INDEX IF NOT EXISTS "bot_memory_impression_last_used_idx"
  ON "affirmative_bot"."bot_memory_impressions" ("last_used_at");

CREATE TABLE IF NOT EXISTS "affirmative_bot"."bot_memory_impression_scans" (
  "document_id" integer PRIMARY KEY REFERENCES "affirmative_bot"."bot_memory_documents"("id") ON DELETE CASCADE,
  "content_hash" text NOT NULL,
  "scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
