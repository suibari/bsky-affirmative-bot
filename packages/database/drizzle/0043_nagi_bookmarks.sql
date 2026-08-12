-- ブックマークは公開 PDS レコードにせず、認証した本人だけが触る AppView データとする。
CREATE TABLE IF NOT EXISTS "nagi"."bookmark_folders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_did" text NOT NULL,
  "name" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "bookmark_folders_owner_id_pk" PRIMARY KEY ("owner_did", "id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "nagi_bookmark_folders_default_idx"
  ON "nagi"."bookmark_folders" ("owner_did") WHERE "is_default" = true;
CREATE INDEX IF NOT EXISTS "nagi_bookmark_folders_owner_idx"
  ON "nagi"."bookmark_folders" ("owner_did", "created_at");

CREATE TABLE IF NOT EXISTS "nagi"."bookmarks" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "owner_did" text NOT NULL,
  "folder_id" uuid NOT NULL,
  "subject_uri" text NOT NULL,
  "subject_type" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "nagi_bookmarks_folder_fk"
    FOREIGN KEY ("owner_did", "folder_id")
    REFERENCES "nagi"."bookmark_folders" ("owner_did", "id") ON DELETE CASCADE,
  CONSTRAINT "nagi_bookmarks_subject_type_check"
    CHECK ("subject_type" IN ('post', 'news', 'diary'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "nagi_bookmarks_owner_subject_idx"
  ON "nagi"."bookmarks" ("owner_did", "subject_uri");
CREATE INDEX IF NOT EXISTS "nagi_bookmarks_owner_created_idx"
  ON "nagi"."bookmarks" ("owner_did", "created_at", "id");
CREATE INDEX IF NOT EXISTS "nagi_bookmarks_subject_idx"
  ON "nagi"."bookmarks" ("subject_uri");
