-- Moves waitlist promotion out of the waitlist-sweeper edge function and into
-- the database, so that freeing a spot ANY way promotes the next player.
--
-- promoteNextWaitlisted() previously lived inside
-- supabase/functions/waitlist-sweeper/index.ts and was reachable only from the
-- two sweeps in that function (expired holds, lapsed waitlist offers). A player
-- cancelling their registration frees a spot and nobody was ever promoted --
-- the spot simply sat empty until a sweep happened to fire for an unrelated
-- reason. Cancellation cannot call a function that lives inside another edge
-- function, so it has to live here.
--
-- Deliberately does NOT send email. Only the in-app notification row is written
-- here; the caller gets the promoted registration back and sends the email
-- itself. Postgres has no business talking to an email provider, and given the
-- 2026-08-21 incident where transactional email failed silently in production,
-- adding a second delivery path from inside a trigger-adjacent function is the
-- wrong trade.

CREATE OR REPLACE FUNCTION "public"."promote_next_waitlisted"(p_tournament_id uuid)
RETURNS TABLE (
  registration_id  uuid,
  player_id        uuid,
  full_name        text,
  email            text,
  offer_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reg    record;
  v_expiry timestamptz := now() + interval '24 hours';
  v_name   text;
BEGIN
  -- FOR UPDATE SKIP LOCKED: two callers can free two spots at the same moment
  -- (a sweep and a cancellation, or two cancellations). Without the lock both
  -- would read the same "next" row and one promotion would be silently lost;
  -- with SKIP LOCKED the second caller takes the following player instead, so
  -- two freed spots promote two people.
  SELECT r.id, r.player_id
    INTO v_reg
    FROM "public"."registrations" r
   WHERE r.tournament_id = p_tournament_id
     AND r.status = 'waitlisted'
   ORDER BY r.waitlist_position NULLS LAST, r.created_at
   LIMIT 1
     FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE "public"."registrations"
     SET status = 'waitlist_offered',
         waitlist_offer_expires_at = v_expiry,
         updated_at = now()
   WHERE id = v_reg.id;

  SELECT t.name INTO v_name FROM "public"."tournaments" t WHERE t.id = p_tournament_id;

  -- Guest entries (director-added, no account) have a null player_id and
  -- notifications.user_id is NOT NULL. They still get promoted -- skipping them
  -- would let an account-holder jump the queue -- but there is nobody to
  -- notify, so the director follows up out of band.
  IF v_reg.player_id IS NOT NULL THEN
    INSERT INTO "public"."notifications" (user_id, type, title, body, link)
    VALUES (
      v_reg.player_id,
      'waitlist_spot_offered',
      'A spot just opened up!',
      'You have 24 hours to complete payment for ' || coalesce(v_name, 'this tournament') || '. Don''t miss it.',
      '/tournaments/' || p_tournament_id
    );
  END IF;

  RETURN QUERY
    SELECT v_reg.id,
           v_reg.player_id,
           p.full_name,
           p.email,
           v_expiry
      FROM (SELECT 1) _
      LEFT JOIN "public"."profiles" p ON p.id = v_reg.player_id;
END;
$function$;

COMMENT ON FUNCTION "public"."promote_next_waitlisted"(uuid) IS
  'Promotes the next waitlisted registration to waitlist_offered with a 24h window and writes the in-app notification. Returns the promoted row so the caller can send the email -- this function deliberately does not. Locks with FOR UPDATE SKIP LOCKED so concurrent callers promote different players. Service role only.';

-- Internal plumbing, not a user-callable RPC. SECURITY DEFINER plus a public
-- grant would let any authenticated user promote players in any tournament.
-- Matches the revoke pattern in 20260821040000 and 20260823010000.
REVOKE ALL ON FUNCTION "public"."promote_next_waitlisted"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."promote_next_waitlisted"(uuid) FROM "anon";
REVOKE ALL ON FUNCTION "public"."promote_next_waitlisted"(uuid) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."promote_next_waitlisted"(uuid) TO "service_role";
