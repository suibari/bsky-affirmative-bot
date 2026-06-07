ALTER TABLE "affirmative_bot"."subscribers"
  ADD CONSTRAINT "subscribers_status_check"
  CHECK (status IN ('active', 'inactive', 'discord_only'));
