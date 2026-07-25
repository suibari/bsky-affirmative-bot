-- ユーザーミュート／チャンネルミュート。
-- ミュートは「誰が誰をミュートしたか」が他ユーザーに漏れてはならないため、PDS レコード
-- （listRecords で誰でも読める）にはせず AppView の DB だけで持つ。所有者本人の
-- com.suibari.nagi.getMutes 以外から読み出す経路を作らないこと。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。

DO $$ BEGIN
  CREATE TYPE "nagi"."mute_subject_type" AS ENUM('actor', 'channel');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "nagi"."mutes" (
  "muter_did" text NOT NULL,
  "subject_type" "nagi"."mute_subject_type" NOT NULL,
  "subject" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mutes_muter_did_subject_type_subject_pk"
    PRIMARY KEY ("muter_did", "subject_type", "subject")
);

CREATE INDEX IF NOT EXISTS "nagi_mutes_muter_idx"
  ON "nagi"."mutes" ("muter_did", "subject_type");
