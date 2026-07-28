-- 翻訳文の出所。"mt" = 翻訳モデルの出力、"authored" = botたん本人が生成した対訳の投入。
-- 定時投稿は Gemini が textJa/textEn を同時に生成しているので、投稿時に textEn を
-- authored として投入し、機械翻訳に上書きさせない（generateAndCache の setWhere で保護）。
-- 既存行はすべて機械翻訳なので既定値 'mt' でよい。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。
ALTER TABLE "nagi"."translations"
  ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'mt' NOT NULL;
