-- Advisor flagged is_coach_publish_ready() as directly RPC-callable by
-- anon/authenticated (Postgres grants EXECUTE to PUBLIC by default on
-- CREATE FUNCTION). It's intended as an internal helper for future RLS
-- policies (Phase 2 offer publish-eligibility), not a public endpoint —
-- revoke direct RPC access. Re-grant to authenticated only if/when a
-- specific RLS policy actually needs it and testing shows the grant is
-- required for policy evaluation.

REVOKE EXECUTE ON FUNCTION "public"."is_coach_publish_ready"(uuid) FROM PUBLIC, anon, authenticated;
