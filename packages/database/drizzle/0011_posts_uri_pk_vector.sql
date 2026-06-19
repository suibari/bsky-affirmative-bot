-- Enable pgvector (idempotent — already installed on this postgres instance)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (snowflake-arctic-embed2 = 1024 dims)
-- Primary key remains did (unchanged)
ALTER TABLE "affirmative_bot"."posts" ADD COLUMN "embedding" vector(1024);

-- HNSW index for cosine similarity (works on small tables without minimum row requirement)
CREATE INDEX "posts_embedding_hnsw_idx"
  ON "affirmative_bot"."posts"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
