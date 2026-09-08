-- Closes the window found by item 1.3's C8 test (TODO1.1_EXECUTION_PLAN.md).
--
-- Deleting an account removes the auth.users row and purges auth.sessions and
-- auth.refresh_tokens, so the session cannot be renewed. But an access token
-- already in the user's hands stays cryptographically valid until it expires --
-- measured at 3600s (ES256) on this project. GoTrue rejects that token
-- immediately (403), because it resolves the user. PostgREST does not: it
-- verifies the signature and never asks whether the subject still exists, and
-- was observed returning 200 for a deleted user's token straight after the
-- delete-account function reported success. For that hour the holder is still
-- role=authenticated with their original sub, so every RLS policy keyed on
-- auth.uid() still matches their tombstone.
--
-- A pre-request hook is used rather than adding `deleted_at IS NULL` to each
-- policy: it is one object covering every current and future table, with
-- nothing for a later policy to forget. It runs on every PostgREST request, so
-- it must stay trivial -- a single lookup on the primary key, further narrowed
-- by profiles_deleted_at_idx.

CREATE OR REPLACE FUNCTION public.reject_deleted_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- Pin the search path: this runs SECURITY DEFINER on every request, so it must
-- not be resolvable against a caller-controlled schema.
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- auth.uid() is null for anon traffic and for service_role callers (including
  -- the delete-account edge function, which must keep working precisely while a
  -- profile is being tombstoned). Both fall through untouched.
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND deleted_at IS NOT NULL
  ) THEN
    -- 42501 = insufficient_privilege, which PostgREST maps to HTTP 403.
    RAISE EXCEPTION 'account deleted'
      USING ERRCODE = '42501',
            HINT = 'This account has been deleted.';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.reject_deleted_users() IS
  'PostgREST db-pre-request hook: rejects requests bearing a still-valid JWT for a deleted (tombstoned) account. See migration 20260820013554 and item 1.3 C8.';

-- The hook executes as the authenticator role before PostgREST switches to the
-- request role, so authenticator is the grantee that matters.
GRANT EXECUTE ON FUNCTION public.reject_deleted_users() TO authenticator;

ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.reject_deleted_users';

NOTIFY pgrst, 'reload config';
