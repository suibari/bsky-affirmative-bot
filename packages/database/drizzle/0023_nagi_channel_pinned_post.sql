-- チャンネルごとに1件のピン止め投稿を保持する。
-- PDS の com.suibari.nagi.channel レコードが真実源で、AppView は参照を索引する。

ALTER TABLE "nagi"."channels" ADD COLUMN IF NOT EXISTS "pinned_post_uri" text;
ALTER TABLE "nagi"."channels" ADD COLUMN IF NOT EXISTS "pinned_post_cid" text;
