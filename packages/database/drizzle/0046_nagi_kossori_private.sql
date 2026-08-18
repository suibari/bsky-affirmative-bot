-- こっそり投稿のプライベート化。
--
-- appview_only: この行の正本が PDS ではなく AppView にしかないことを示す。可視性の判定は
-- 従来どおり kossori 列が持ち（既存のこっそり投稿にも即座に効かせるため）、この列は
-- 「reconcile で消してはいけない」「削除は XRPC 経由」といった保管場所の判断にだけ使う。
-- 既存行はすべて PDS に正本があるので false のまま（バックフィルなし）。
ALTER TABLE "nagi"."posts"
  ADD COLUMN IF NOT EXISTS "appview_only" boolean DEFAULT false NOT NULL;

-- is_private: その日の投稿にこっそりが1つ以上含まれる日記。本人以外には本文を返さず、
-- botたんの PDS にもレコードを作らない。既存行は false のまま（バックフィルなし）。
ALTER TABLE "nagi"."diaries"
  ADD COLUMN IF NOT EXISTS "is_private" boolean DEFAULT false NOT NULL;
