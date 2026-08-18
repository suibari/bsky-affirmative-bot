-- 記念日カード。ハロウィンや誕生日など「その年その日にしか手に入らない1枚」を、
-- 通常カードと同じ card_instances に card_volume = 0（記念日段）として入れる。
-- card_number = 西暦 * 100 + slot なので、既存の
-- UNIQUE(owner_did, card_volume, card_number) がそのまま「同じ記念日は1年に1枚」を強制する。
-- そのため card_draws（1日1回のガチャ枠）には一切書かず、この表も変更しない。
--
-- anniversary_label: ユーザーが自分で登録した記念日の名前を、受け取った時点のまま焼き付ける。
-- あとで本人が記念日名を変えても過去のカードの名前は変わらない（カードは記録なので不変であるべき）。
-- プリセット祝日と Nagi 登録記念日は NULL で、名前は slot から holidays.json 経由で引く
-- （＝JSON の文言を直せば全ユーザーに反映される、というカード定義の扱いと揃える）。
-- 既存行はすべて通常カードなので NULL のまま（バックフィルなし）。
ALTER TABLE "nagi"."card_instances"
  ADD COLUMN IF NOT EXISTS "anniversary_label" text;
