-- 通常のデプロイでは drizzle:push 前の prepareDrizzlePush.mjs が同じ変更を冪等に行う。
-- このファイルは手動適用時の参照でもある。
-- drizzle-kit は、複合 PRIMARY KEY を複合外部キーが参照している状態で後続の
-- push を行うと、外部キーを再作成してから参照先 PRIMARY KEY を削除するSQLを
-- 生成することがある。UUID id の単一主キー・外部キーへ変更して回避する。
--
-- 既存の bookmarks / bookmark_folders 行は削除・更新しない。外部キーを外した
-- 瞬間が外部から見えないよう、制約変更全体を1トランザクションで適用する。
BEGIN;

SET LOCAL lock_timeout = '10s';

ALTER TABLE "nagi"."bookmarks"
  DROP CONSTRAINT IF EXISTS "nagi_bookmarks_folder_fk";

-- drizzle-kit push で作成した場合と 0043 のSQLを手動適用した場合で名前が異なる。
ALTER TABLE "nagi"."bookmark_folders"
  DROP CONSTRAINT IF EXISTS "bookmark_folders_owner_did_id_pk",
  DROP CONSTRAINT IF EXISTS "bookmark_folders_owner_id_pk",
  DROP CONSTRAINT IF EXISTS "nagi_bookmark_folders_owner_id_unique";

DROP INDEX IF EXISTS "nagi"."nagi_bookmark_folders_owner_id_idx";

ALTER TABLE "nagi"."bookmark_folders"
  ADD CONSTRAINT "bookmark_folders_pkey" PRIMARY KEY ("id");

ALTER TABLE "nagi"."bookmarks"
  ADD CONSTRAINT "nagi_bookmarks_folder_fk"
  FOREIGN KEY ("folder_id")
  REFERENCES "nagi"."bookmark_folders" ("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT;
