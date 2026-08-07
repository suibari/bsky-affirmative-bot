-- Bluesky 日記が「その日ぶん書き終えたか」を持つ場所が無く、生成失敗やプロセス再起動で
-- その日の日記が丸ごと欠測していた。ユーザーのローカル日付 "YYYY-MM-DD" を記録し、
-- 22時を過ぎた取りこぼしを毎時の再スキャンで回収できるようにする。
-- 既存行は NULL のままでよい（初回は「まだ書いていない」として扱われる）。

ALTER TABLE "affirmative_bot"."followers"
  ADD COLUMN IF NOT EXISTS "last_diary_date" text;
