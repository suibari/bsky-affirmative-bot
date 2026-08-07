-- フィードのタブ構成。順序のある1本の配列なので updated_at による後勝ちで丸ごと差し替える。
-- 行が無い＝一度もカスタムしていない（クライアントは既定タブを使う）。
-- emoji_favorites に列を足さないのは、性質の違う2設定が1つの updated_at を共有すると
-- 後勝ち判定が壊れるため。
-- 通常のデプロイは drizzle-kit push なので、このファイルは手動適用時の参照でもある。

CREATE TABLE IF NOT EXISTS "nagi"."feed_tabs" (
  "did" text PRIMARY KEY,
  "tabs" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
