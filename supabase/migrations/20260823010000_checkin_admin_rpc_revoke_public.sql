-- ─────────────────────────────────────────────────────────────────────────────
-- Apply the 20260821040000 fix to the two SECURITY DEFINER functions it missed.
--
-- Postgres grants EXECUTE to PUBLIC by default on every newly created function,
-- and `anon` inherits that grant. 20260821040000 corrected this for
-- director_add_tournament_registration, but check_in_registration and
-- admin_delete_tournament were created the same way and still carry it.
-- Confirmed against production:
--
--   check_in_registration     =X/postgres | anon=X/postgres | authenticated=X/postgres
--   admin_delete_tournament   =X/postgres | authenticated=X/postgres
--
-- (`=X/postgres` is the PUBLIC grant.)
--
-- Nothing is exposed today. check_in_registration raises `not_authenticated`
-- when auth.uid() is null, then requires is_approved_director() AND a
-- director_id match on the tournament; admin_delete_tournament requires
-- is_admin(). Both guards were read directly and are correct.
--
-- This is defence in depth, for the same reason as 20260821040000: the check
-- inside a SECURITY DEFINER function should be the second line of defence, not
-- the only one. A function that runs as its owner should not be reachable by an
-- anonymous role at all.
--
-- admin_delete_tournament stays granted to `authenticated` rather than being
-- restricted further — is_admin() inside the function is what distinguishes an
-- admin, and there is no separate admin role to grant to.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION "public"."check_in_registration"(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."check_in_registration"(uuid, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION "public"."check_in_registration"(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION "public"."admin_delete_tournament"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."admin_delete_tournament"(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION "public"."admin_delete_tournament"(uuid) TO authenticated;
