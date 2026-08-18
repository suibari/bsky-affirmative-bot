-- 未サインイン端末の「今日の1枚」。端末秘密は SHA-256 ハッシュだけを保存し、
-- 通常カードと同じ JST 4:00 境界を越えた行はアプリ処理時に削除する。
CREATE TABLE IF NOT EXISTS "nagi"."guest_card_draws" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "device_token_hash" text NOT NULL,
  "draw_date" text NOT NULL,
  "card_volume" integer NOT NULL,
  "card_number" integer NOT NULL,
  "claimed_by_did" text,
  "claimed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "nagi_guest_card_draw_device_date_idx"
  ON "nagi"."guest_card_draws" ("device_token_hash", "draw_date");
CREATE INDEX IF NOT EXISTS "nagi_guest_card_draw_expiry_idx"
  ON "nagi"."guest_card_draws" ("expires_at");
