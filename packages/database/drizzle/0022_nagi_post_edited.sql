-- 投稿後編集の検知フラグ。AppView が cid 変化を観測した編集で true になり、以後戻さない（単調）。
-- 既存行はバックフィルせず false のまま（機能導入後に観測した編集のみ反映）。UI の「編集済み」バッジ用。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。

ALTER TABLE "nagi"."posts" ADD COLUMN IF NOT EXISTS "edited" boolean DEFAULT false NOT NULL;
