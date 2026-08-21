CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS "affirmative_bot"."bot_memory_documents" (
  "id" serial PRIMARY KEY,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "source_uri" text,
  "author_id" text,
  "content" text NOT NULL,
  "bot_response" text,
  "occurred_at" timestamp with time zone NOT NULL,
  "affirmation_score" integer,
  "metadata" jsonb,
  "content_hash" text NOT NULL,
  "embedding_model" text,
  "embedding" vector(1024),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "bot_memory_source_key_idx"
  ON "affirmative_bot"."bot_memory_documents" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "bot_memory_source_occurred_idx"
  ON "affirmative_bot"."bot_memory_documents" ("source_type", "occurred_at");
CREATE INDEX IF NOT EXISTS "bot_memory_author_occurred_idx"
  ON "affirmative_bot"."bot_memory_documents" ("author_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "bot_memory_pending_embedding_idx"
  ON "affirmative_bot"."bot_memory_documents" ("embedding_model", "updated_at")
  WHERE "deleted_at" IS NULL AND "embedding" IS NULL;
CREATE INDEX IF NOT EXISTS "bot_memory_embedding_hnsw_idx"
  ON "affirmative_bot"."bot_memory_documents"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS "bot_memory_content_trgm_idx"
  ON "affirmative_bot"."bot_memory_documents"
  USING gin ("content" gin_trgm_ops);

CREATE TABLE IF NOT EXISTS "affirmative_bot"."bot_memory_usages" (
  "id" serial PRIMARY KEY,
  "document_id" integer NOT NULL REFERENCES "affirmative_bot"."bot_memory_documents"("id") ON DELETE CASCADE,
  "purpose" text NOT NULL,
  "output_ref" text,
  "used_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "bot_memory_usage_document_used_idx"
  ON "affirmative_bot"."bot_memory_usages" ("document_id", "used_at");
CREATE INDEX IF NOT EXISTS "bot_memory_usage_purpose_used_idx"
  ON "affirmative_bot"."bot_memory_usages" ("purpose", "used_at");
