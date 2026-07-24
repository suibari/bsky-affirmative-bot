-- ハッシュタグ検索（/search?tag=）。facets の #tag feature から抽出した小文字タグ配列を
-- 投稿ごとに保持し、GIN で絞り込む。既存行はバックフィルせず NULL のまま（新規/更新投稿のみ反映）。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。

ALTER TABLE "nagi"."posts" ADD COLUMN IF NOT EXISTS "tags" text[];
CREATE INDEX IF NOT EXISTS "nagi_posts_tags_idx" ON "nagi"."posts" USING gin ("tags");
