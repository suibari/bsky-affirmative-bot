-- こっそりモード。true のトップレベル投稿はグローバル/全肯定TLに出さない。
-- プロフィール・スレッド・通知からは見える（完全非公開ではない）。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。

ALTER TABLE "nagi"."posts" ADD COLUMN IF NOT EXISTS "kossori" boolean DEFAULT false NOT NULL;
