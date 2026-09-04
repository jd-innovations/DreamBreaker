-- ─────────────────────────────────────────────────────────────────────────────
-- Fix an ineffective REVOKE in 20260821030000.
--
-- That migration ended with:
--
--   REVOKE EXECUTE ON FUNCTION director_add_tournament_registration(...) FROM anon;
--   GRANT  EXECUTE ON FUNCTION director_add_tournament_registration(...) TO authenticated;
--
-- The REVOKE was a no-op. Postgres grants EXECUTE to PUBLIC by default on every
-- newly created function, and `anon` inherits that PUBLIC grant — revoking from
-- the role by name leaves the inherited grant untouched. Verified after the
-- push: has_function_privilege('anon', ..., 'EXECUTE') was still true.
--
-- Impact was limited, not zero. The function body raises `not_authenticated`
-- when auth.uid() is null, so an anonymous caller could never actually create a
-- registration — confirmed by direct test, which wrote no registrations and no
-- guest rows. But a SECURITY DEFINER function that runs as the owner should not
-- be reachable by an anonymous role at all; the guard inside it should be the
-- second line of defence, not the only one.
--
-- The correct form revokes from PUBLIC first, then grants back only the role
-- that should have it.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION "public"."director_add_tournament_registration"(uuid, uuid, uuid, jsonb, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."director_add_tournament_registration"(uuid, uuid, uuid, jsonb, uuid, jsonb) FROM anon;

GRANT EXECUTE ON FUNCTION "public"."director_add_tournament_registration"(uuid, uuid, uuid, jsonb, uuid, jsonb) TO authenticated;
