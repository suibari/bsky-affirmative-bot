-- Bluemoji の name は表示用エイリアスであり、レコードの識別子ではない。
-- 同じ所有者が同名・別URIの絵文字を持てるよう、検索用の複合インデックスは
-- 維持したまま一意性だけを外す。既存行や参照中のリアクションは変更しない。

DROP INDEX IF EXISTS "nagi"."nagi_emoji_did_name_idx";
CREATE INDEX IF NOT EXISTS "nagi_emoji_did_name_idx"
  ON "nagi"."emojis" ("did", "name");
