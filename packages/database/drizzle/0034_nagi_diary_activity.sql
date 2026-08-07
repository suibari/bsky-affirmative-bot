-- 今後生成する日記に、その日の象徴絵文字と生成材料の投稿数を保持する。
-- 既存日記は推計せず NULL のままにし、従来表示との互換性を保つ。

ALTER TABLE "nagi"."diaries"
  ADD COLUMN IF NOT EXISTS "emoji" text,
  ADD COLUMN IF NOT EXISTS "post_count" integer;

ALTER TABLE "nagi"."diaries"
  DROP CONSTRAINT IF EXISTS "nagi_diaries_post_count_positive";

ALTER TABLE "nagi"."diaries"
  ADD CONSTRAINT "nagi_diaries_post_count_positive"
  CHECK ("post_count" IS NULL OR "post_count" > 0);
