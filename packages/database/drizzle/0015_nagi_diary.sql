-- Nagi の日記（com.suibari.nagi.diary）。botたんが書き、通知とプロフィールの日記タブから見る。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。

-- ADD VALUE は追加したセッション内では使えないため、テーブル作成より先に単独で流す。
ALTER TYPE "nagi"."notification_type" ADD VALUE IF NOT EXISTS 'diary';

CREATE TABLE IF NOT EXISTS "nagi"."diaries" (
  "uri" text PRIMARY KEY,
  "cid" text NOT NULL,
  "did" text NOT NULL,
  "subject_did" text NOT NULL,
  "diary_date" text NOT NULL,
  "text" text NOT NULL,
  "title_ja" text,
  "title_en" text,
  "langs" jsonb,
  "record_created_at" timestamptz NOT NULL,
  "indexed_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "nagi_diary_subject_date_idx" ON "nagi"."diaries" ("subject_did", "diary_date");
CREATE INDEX IF NOT EXISTS "nagi_diary_subject_idx" ON "nagi"."diaries" ("subject_did", "diary_date");
