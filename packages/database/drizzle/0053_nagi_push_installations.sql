-- Push購読をOAuth sessionから独立して自己修復できるinstallation capability方式へ拡張する。
-- 旧クライアントの行は installation_id/capability_hash がnullのまま残し、次回の認証済み
-- registerPushSubscriptionで漸進的に移行する。通常のデプロイは drizzle-kit push。

ALTER TABLE "nagi"."push_subscriptions"
	ADD COLUMN IF NOT EXISTS "installation_id" uuid,
	ADD COLUMN IF NOT EXISTS "capability_hash" text,
	ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	ADD COLUMN IF NOT EXISTS "last_confirmed_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "last_success_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "invalidated_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "invalidation_reason" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nagi_push_subscription_installation_idx"
	ON "nagi"."push_subscriptions" USING btree ("installation_id")
	WHERE "installation_id" IS NOT NULL;
