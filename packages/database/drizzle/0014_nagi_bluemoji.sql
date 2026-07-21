-- カスタム絵文字リアクション（Bluemoji: blue.moji.collection.item）対応
CREATE TABLE IF NOT EXISTS "nagi"."emojis" ("uri" text PRIMARY KEY, "cid" text NOT NULL, "did" text NOT NULL, "name" text NOT NULL, "alt" text, "formats" jsonb NOT NULL, "adult_only" boolean DEFAULT false NOT NULL, "created_at" timestamptz NOT NULL, "indexed_at" timestamptz DEFAULT now() NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS "nagi_emoji_did_name_idx" ON "nagi"."emojis" ("did", "name");
CREATE INDEX IF NOT EXISTS "nagi_emoji_name_idx" ON "nagi"."emojis" ("name");

ALTER TABLE "nagi"."reactions" ADD COLUMN IF NOT EXISTS "emoji_uri" text;
ALTER TABLE "nagi"."reactions" ADD COLUMN IF NOT EXISTS "emoji_key" text;
UPDATE "nagi"."reactions" SET "emoji_key" = COALESCE("emoji_uri", "emoji") WHERE "emoji_key" IS NULL;
ALTER TABLE "nagi"."reactions" ALTER COLUMN "emoji_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "nagi_reaction_actor_subject_emoji_key_idx" ON "nagi"."reactions" ("did", "subject_uri", "emoji_key");

-- 旧 (did, subject_uri, emoji) の一意制約／インデックスを落とす（0012 ではインライン UNIQUE 制約で作られている）
DO $$
DECLARE target text;
BEGIN
  FOR target IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'nagi' AND t.relname = 'reactions' AND c.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
           FROM unnest(c.conkey) k
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k)
          = ARRAY['did', 'emoji', 'subject_uri']
  LOOP
    EXECUTE format('ALTER TABLE "nagi"."reactions" DROP CONSTRAINT %I', target);
  END LOOP;
END $$;
DROP INDEX IF EXISTS "nagi"."nagi_reaction_actor_subject_emoji_idx";
