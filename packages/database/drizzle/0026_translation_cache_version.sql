-- 翻訳モデル・プロンプト・検証規則の世代。
-- 既存行は version 1 のまま残し、新実装が version 3 として遅延再生成・上書きする。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。
ALTER TABLE "nagi"."translations"
  ADD COLUMN IF NOT EXISTS "cache_version" integer DEFAULT 1 NOT NULL;
