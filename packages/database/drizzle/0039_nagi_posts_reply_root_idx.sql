-- チャンネル所属をスレッドルート所有に統一したのに伴う索引。ルート投稿を取り込むたびに
-- 「配下の返信の channel_uri をルートに合わせる」UPDATE が走るため、reply_root_uri で
-- 引けるようにする（従来は reply_parent_uri の索引しか無く、毎回シーケンシャルスキャンだった）。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。

CREATE INDEX IF NOT EXISTS "nagi_posts_reply_root_idx" ON "nagi"."posts" ("reply_root_uri");

-- 既存データの backfill（索引作成後に1回だけ）。旧クライアントは親から channel を継承して
-- いたので大半は既に一致しており、botたん返信など一部だけが更新される。
-- UPDATE nagi.posts r SET channel_uri = root.channel_uri
--   FROM nagi.posts root
--  WHERE r.reply_root_uri = root.uri
--    AND r.channel_uri IS DISTINCT FROM root.channel_uri;
