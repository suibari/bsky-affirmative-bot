-- 「みんなで全肯定」を常時ストックできるようにする。
--
-- これまでは author_did が主キーで、1作者につき生涯1行しか持てなかった。
-- そのためストック総量がアクティブ作者数で頭打ちになり、一覧がほとんど更新されなかった。
-- 主キーを投稿の URI に移し、1作者から複数ストックできるようにする。
-- 1作者による占有は「直近24hに作った行数」（worker 側の AUTHOR_STOCK_LIMIT）で防ぐ。

-- 既存行のうち source_uri が重複するものは無いはず（旧 unique index が (source_uri, source_cid)
-- で担保していた）が、同一 URI で cid だけ違う行が残っている可能性はあるので、
-- 新しい方（updated_at が新しい行）だけを残す。
DELETE FROM "nagi"."community_affirmations" a
USING "nagi"."community_affirmations" b
WHERE a."source_uri" = b."source_uri"
  AND (a."updated_at", a."author_did") < (b."updated_at", b."author_did");

DROP INDEX IF EXISTS "nagi"."nagi_community_affirmations_source_idx";

ALTER TABLE "nagi"."community_affirmations"
  DROP CONSTRAINT IF EXISTS "community_affirmations_pkey";

ALTER TABLE "nagi"."community_affirmations"
  ALTER COLUMN "author_did" SET NOT NULL;

ALTER TABLE "nagi"."community_affirmations"
  ADD CONSTRAINT "community_affirmations_pkey" PRIMARY KEY ("source_uri");

-- 作者ごとの直近ストック数を数えるため。
CREATE INDEX IF NOT EXISTS "nagi_community_affirmations_author_created_idx"
  ON "nagi"."community_affirmations" ("author_did", "created_at");

-- 読み出しは「生成が新しい順」なので、posted だけを更新時刻で引けるようにする。
CREATE INDEX IF NOT EXISTS "nagi_community_affirmations_posted_idx"
  ON "nagi"."community_affirmations" ("state", "updated_at");
