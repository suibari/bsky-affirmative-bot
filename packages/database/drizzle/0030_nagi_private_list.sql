-- ホームに表示するユーザーの非公開リスト。
-- PDS レコードにはせず、認証した owner 本人の API とホーム抽出だけで利用する。
-- 通常のデプロイは drizzle-kit push なので、このファイルは手動適用時の参照でもある。

CREATE TABLE IF NOT EXISTS "nagi"."private_list_members" (
  "owner_did" text NOT NULL,
  "member_did" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "private_list_members_owner_did_member_did_pk"
    PRIMARY KEY ("owner_did", "member_did"),
  CONSTRAINT "private_list_members_not_self"
    CHECK ("owner_did" <> "member_did")
);

CREATE INDEX IF NOT EXISTS "nagi_private_list_owner_idx"
  ON "nagi"."private_list_members" ("owner_did", "created_at");

CREATE INDEX IF NOT EXISTS "nagi_private_list_member_idx"
  ON "nagi"."private_list_members" ("member_did");
