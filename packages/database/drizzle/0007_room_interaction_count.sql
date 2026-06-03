ALTER TABLE "affirmative_bot"."followers"
  ADD COLUMN "room_interaction_count" integer DEFAULT 0;

-- ChatVRM（PostgREST 経由）からのアトミックインクリメント用関数
CREATE OR REPLACE FUNCTION affirmative_bot.increment_room_interaction(p_did text, p_amount int)
RETURNS void LANGUAGE sql AS $$
  UPDATE affirmative_bot.followers
  SET room_interaction_count = room_interaction_count + p_amount
  WHERE did = p_did;
$$;
