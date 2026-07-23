-- チャンネル機能（com.suibari.nagi.channel）。作成者のPDSが真実源、AppViewはインデックス。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。

CREATE TABLE IF NOT EXISTS "nagi"."channels" (
  "uri" text PRIMARY KEY NOT NULL,
  "cid" text NOT NULL,
  "rkey" text NOT NULL,
  "did" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "banner_cid" text,
  "record_created_at" timestamptz NOT NULL,
  "indexed_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "nagi_channels_idx" ON "nagi"."channels" ("indexed_at");

-- 投稿の所属チャンネル。返信は親の channel を継承する。
ALTER TABLE "nagi"."posts" ADD COLUMN IF NOT EXISTS "channel_uri" text;
-- CH 限定＝グローバル/全肯定TL非表示（kossori と同じ除外扱い）。CH TL には出る。
ALTER TABLE "nagi"."posts" ADD COLUMN IF NOT EXISTS "channel_only" boolean DEFAULT false NOT NULL;
CREATE INDEX IF NOT EXISTS "nagi_posts_channel_idx" ON "nagi"."posts" ("channel_uri", "indexed_at");
