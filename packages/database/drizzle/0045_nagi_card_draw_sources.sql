-- 1日のカード取得を「my Nagi の通常枠」と「他ユーザーへのリアクション枠」に分ける。
-- 既存行はすべて通常枠として扱い、旧 AppView が source を指定せず INSERT しても
-- DEFAULT により従来どおり通常枠だけを利用する。
DO $$ BEGIN
  CREATE TYPE "nagi"."card_draw_source" AS ENUM ('my_nagi', 'reaction');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "nagi"."card_draws"
  ADD COLUMN IF NOT EXISTS "draw_source" "nagi"."card_draw_source" DEFAULT 'my_nagi' NOT NULL,
  ADD COLUMN IF NOT EXISTS "trigger_uri" text;

-- drizzle-kit push は、新しく追加する列を含む複合 PRIMARY KEY を列追加より先に
-- 適用しようとして失敗することがある。日次枠の排他に必要なのは一意性なので、
-- 同じ保証を列追加後に作られる UNIQUE INDEX で持たせる。
ALTER TABLE "nagi"."card_draws"
  DROP CONSTRAINT IF EXISTS "card_draws_did_draw_date_pk",
  DROP CONSTRAINT IF EXISTS "card_draws_did_draw_date_source_pk";

CREATE UNIQUE INDEX IF NOT EXISTS "nagi_card_draw_did_date_source_idx"
  ON "nagi"."card_draws" ("did", "draw_date", "draw_source");

ALTER TABLE "nagi"."card_draws"
  DROP CONSTRAINT IF EXISTS "card_draws_reaction_trigger_check";

ALTER TABLE "nagi"."card_draws"
  ADD CONSTRAINT "card_draws_reaction_trigger_check" CHECK (
    ("draw_source" = 'my_nagi' AND "trigger_uri" IS NULL)
    OR
    ("draw_source" = 'reaction' AND "trigger_uri" IS NOT NULL)
  );
