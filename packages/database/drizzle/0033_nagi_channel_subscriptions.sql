-- 購読（参加）中のチャンネル。my Nagi の「参加中チャンネル」枠の元データ。
-- private_list_members と同じく PDS レコードにはせず、認証した owner 本人にしか返さない。
-- 通常のデプロイは drizzle-kit push なので、このファイルは手動適用時の参照でもある。

CREATE TABLE IF NOT EXISTS "nagi"."channel_subscriptions" (
  "owner_did" text NOT NULL,
  "channel_uri" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "channel_subscriptions_owner_did_channel_uri_pk"
    PRIMARY KEY ("owner_did", "channel_uri")
);

CREATE INDEX IF NOT EXISTS "nagi_channel_subscriptions_owner_idx"
  ON "nagi"."channel_subscriptions" ("owner_did", "created_at");

CREATE INDEX IF NOT EXISTS "nagi_channel_subscriptions_channel_idx"
  ON "nagi"."channel_subscriptions" ("channel_uri");
