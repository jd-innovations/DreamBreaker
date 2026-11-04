-- =============================================================================
-- Let a player register again after withdrawing (or after a hold expired)
-- =============================================================================
-- fn_enforce_single_division (last defined in 20260821030000) rejects an insert
-- when ANY registrations row exists for the same player/guest and tournament,
-- including released ones. So a player who cancelled -- the cancel-registration
-- edge function sets status = 'withdrawn' -- or whose hold lapsed to
-- 'expired_hold' could never register for that tournament again. The client
-- check (isPlayerRegistered) already ignores those rows, so the Register button
-- worked and the insert then failed with P0003.
--
-- Released rows no longer count. 'disqualified' and 'no_show' still block: those
-- are director decisions, not a player freeing their spot.
--
-- The trigger now also fires when an UPDATE moves a row from released back to
-- active (the director's restoreCancelled sets withdrawn -> registered), so a
-- restore cannot create a second active registration next to one the player
-- made after withdrawing. Updates between active statuses (held -> registered,
-- waitlist promotion, check-in) are not re-checked.
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."fn_enforce_single_division"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_released constant public.registration_status[] :=
    array['withdrawn', 'expired_hold']::public.registration_status[];
begin
  -- A released row never conflicts with anything.
  if new.status = any (v_released) then
    return new;
  end if;

  -- On UPDATE, only a released -> active transition needs checking.
  if tg_op = 'UPDATE' and not (old.status = any (v_released)) then
    return new;
  end if;

  if new.player_id is not null and exists (
    select 1 from public.registrations
     where tournament_id = new.tournament_id
       and player_id = new.player_id
       and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000')
       and not (status = any (v_released))
  ) then
    raise exception 'Player % is already registered for tournament %.', new.player_id, new.tournament_id using errcode = 'P0003';
  end if;

  if new.guest_player_id is not null and exists (
    select 1 from public.registrations
     where tournament_id = new.tournament_id
       and guest_player_id = new.guest_player_id
       and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000')
       and not (status = any (v_released))
  ) then
    raise exception 'Guest % is already registered for tournament %.', new.guest_player_id, new.tournament_id using errcode = 'P0003';
  end if;

  return new;
end; $$;

DROP TRIGGER IF EXISTS "trg_enforce_single_division" ON "public"."registrations";
CREATE TRIGGER "trg_enforce_single_division"
  BEFORE INSERT OR UPDATE OF "status" ON "public"."registrations"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_enforce_single_division"();
