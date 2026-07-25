-- 全肯定カード（1日1回引けるトレカ）。
-- カード定義そのもの（名前・フレーバー・ATK/DEF）は shared-configs の cards_v{n}.json が真実源で
-- DB には持たない。ここに持つのは「誰がどの1枚を持っているか」だけ。
-- どのカードかは (card_volume, card_number) の組で決まる（表示は v1-001 形式）。
-- 一度リリースした番号は変更禁止。振り直すとこの列の指す先が変わってしまう。
--
-- PDS レコードにしない理由: ガチャ結果をユーザーの repo に置くと createRecord で AAR を
-- 自作できてしまい非改竄性が保てない。加えて将来の交換は2つの repo にまたがるため原子的に
-- 行えない。よって AppView が権威を持つ（この DB を作り直すと所持カードは失われる）。
--
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。

-- card_instances.id は交換しても不変。botたんコメントがこの行に紐づくので、
-- owner_did を差し替えるだけで「交換してもコメントは維持される」が成立する。
CREATE TABLE IF NOT EXISTS "nagi"."card_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "card_volume" integer NOT NULL,
  "card_number" integer NOT NULL,
  "owner_did" text NOT NULL,
  "first_owner_did" text NOT NULL,
  "comment_ja" text,
  "comment_en" text,
  "comment_model" text,
  "comment_prompt_version" text,
  "duplicate_count" integer DEFAULT 1 NOT NULL,
  "acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- コレクションは「集合」。同種を引き直しても行は増やさず duplicate_count を上げる。
-- 先頭が owner_did なので、コレクション一覧の owner_did 検索もこの索引で足りる。
CREATE UNIQUE INDEX IF NOT EXISTS "nagi_card_instance_owner_card_idx"
  ON "nagi"."card_instances" ("owner_did", "card_volume", "card_number");

-- (did, draw_date) の主キーそのものが「1日1回」の強制。アプリ側の事前チェックではなく
-- DB 制約で担保しているので、二重クリックや同時リクエストでも二重ドローにならない。
-- draw_date は JST 4:00 始まりの "YYYY-MM-DD"（shared-configs の cardDrawDate が算出）。
CREATE TABLE IF NOT EXISTS "nagi"."card_draws" (
  "did" text NOT NULL,
  "draw_date" text NOT NULL,
  "card_volume" integer NOT NULL,
  "card_number" integer NOT NULL,
  -- 日次ロック（この主キー）を先に取る必要があるので insert 時点では未確定。
  -- 同一トランザクション内の直後に埋めるので、実際に NULL のまま残ることはない。
  "instance_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- 主キーが「今日引いたか」の検索索引そのものなので、追加の索引は要らない。
  CONSTRAINT "card_draws_did_draw_date_pk" PRIMARY KEY ("did", "draw_date")
);

-- botたんコメント生成のリースキュー（analysis_jobs と同型）。enqueue は AppView の drawCard、
-- 処理は nagi_bot_server の NagiCardCommentWorker。instance_id が主キーなので、
-- 同じ1枚に対するジョブは常に1件（引き直しでも上書きされる）。
-- bot_job_state enum は 0018 以降で既に存在する前提。
CREATE TABLE IF NOT EXISTS "nagi"."card_comment_jobs" (
  "instance_id" uuid PRIMARY KEY NOT NULL,
  "state" "nagi"."bot_job_state" DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "lease_expires_at" timestamp with time zone,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "nagi_card_comment_jobs_ready_idx"
  ON "nagi"."card_comment_jobs" ("state", "next_attempt_at");
