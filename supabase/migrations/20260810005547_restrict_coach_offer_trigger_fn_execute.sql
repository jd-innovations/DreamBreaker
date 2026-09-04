-- Trigger functions don't need direct RPC callability; Postgres grants
-- EXECUTE to PUBLIC by default on CREATE FUNCTION. Revoke it, matching the
-- is_coach_publish_ready() precedent (20260809150100).
REVOKE EXECUTE ON FUNCTION "public"."fn_enforce_coach_offer_publish_rules"() FROM PUBLIC, anon, authenticated;
