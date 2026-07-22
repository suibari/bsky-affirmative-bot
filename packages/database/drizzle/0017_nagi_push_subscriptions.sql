-- Web Push（VAPID）の購読を保持する。endpoint がプッシュサービス上の宛先で自然な一意キー。
-- 同一ユーザーが複数デバイス/ブラウザから購読するため recipient_did ごとに複数行を持ちうる。
-- 通常のデプロイは drizzle-kit push なのでこのファイルは記録用（手で当てる場合の参照）。

CREATE TABLE IF NOT EXISTS "nagi"."push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"recipient_did" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nagi_push_subscription_did_idx" ON "nagi"."push_subscriptions" USING btree ("recipient_did");
