-- 端末をまたいで同期する本人の設定（my Nagi の既読位置とお気に入り絵文字）。
-- どちらも「いつ何を読んだか」「何を好んでいるか」を含むので PDS レコードにはせず、
-- 認証した本人の getPreferences / putPreferences だけが触る。
-- 通常のデプロイは drizzle-kit push なので、このファイルは手動適用時の参照でもある。

CREATE TABLE IF NOT EXISTS "nagi"."read_positions" (
  "did" text NOT NULL,
  "section" text NOT NULL,
  "indexed_at" timestamp with time zone NOT NULL,
  "uri" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "read_positions_did_section_pk" PRIMARY KEY ("did", "section")
);

CREATE TABLE IF NOT EXISTS "nagi"."emoji_favorites" (
  "did" text PRIMARY KEY,
  "choices" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
