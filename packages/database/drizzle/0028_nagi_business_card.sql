-- 名刺（デジタル名刺カード）機能。
--   nagi.actor_analyses に名刺用の短文(tagline)とハッシュタグ3つ(tags)を追加。
--   nagi.notification_type に 'analysis'（分析＝名刺の更新通知）を追加。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。
--
-- 既存行はバックフィルしない（tagline/tags は NULL のまま）。名刺側で欠損にフォールバックし、
-- 次に分析が走ったタイミングで prompt_version='nagi-analysis-v2' とともに埋まる。
--
-- 注意: ALTER TYPE ... ADD VALUE は PostgreSQL 11 以前ではトランザクション内で実行できない。
-- 手で当てる場合はこのファイルを psql に一括で流さず、1文ずつ実行すること。

ALTER TYPE "nagi"."notification_type" ADD VALUE IF NOT EXISTS 'analysis';

ALTER TABLE "nagi"."actor_analyses"
  ADD COLUMN IF NOT EXISTS "tagline_ja" text,
  ADD COLUMN IF NOT EXISTS "tagline_en" text,
  ADD COLUMN IF NOT EXISTS "tags_ja" text[],
  ADD COLUMN IF NOT EXISTS "tags_en" text[];
