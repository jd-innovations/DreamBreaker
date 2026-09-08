-- Phase 5.1: Tournament QR Check-In
--
-- Adds one SECURITY DEFINER RPC, check_in_registration(), that becomes the
-- single authoritative check-in mutation for BOTH the existing manual
-- check-in button and the new QR scanner path (Phase 5.1 Step 15: "QR and
-- manual check-in should ultimately call the same authoritative business
-- mutation"). It replaces the raw client-side
-- `update registrations set status = 'checked_in' ...` that
-- checkInPlayer() previously issued directly.
--
-- The existing RLS policy "registrations: director update own tournament"
-- already made that raw update genuinely director-gated (see
-- QR_CAMERA_PHASE5.md's tournament check-in audit), but it could not, by
-- itself, provide everything Phase 5.1 needs:
--   - distinguishing "already checked in" from a fresh check-in (the raw
--     update would silently re-stamp checked_in_at on every call)
--   - rejecting a registration that belongs to a different tournament than
--     the one the director is currently operating in (RLS only checks that
--     the director owns *a* tournament matching the registration's actual
--     tournament_id -- it can't know which tournament screen the director
--     currently has open, so a director who manages multiple tournaments
--     could otherwise check a Tournament-B player into Tournament-A's
--     roster without any error)
--   - returning confirmation data (player/division/tournament name) for the
--     director to visually verify the person
-- This migration adds exactly the RPC needed to close those gaps, without
-- touching RLS or introducing a second check-in system.
--
-- No new tables, no new columns. The QR credential is registrations.id
-- itself (a gen_random_uuid(), already non-sequential/non-guessable) --
-- see TOURNAMENT_QR_CHECKIN_PHASE5_1.md "QR Credential Design" for why no
-- separate token table was needed.

CREATE OR REPLACE FUNCTION "public"."check_in_registration"(
  "p_registration_id" "uuid",
  "p_tournament_id" "uuid"
) RETURNS TABLE(
  "result" "text",
  "reason" "text",
  "registration_id" "uuid",
  "player_name" "text",
  "division_name" "text",
  "tournament_name" "text",
  "checked_in_at" timestamp with time zone
)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_reg public.registrations;
  v_tournament_name text;
  v_player_name text;
  v_division_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Authorize the actor against the tournament context they claim to be
  -- operating in FIRST, before touching the scanned registration at all.
  -- An unauthorized caller (or an authorized director scanning a QR for a
  -- tournament they don't direct) learns nothing about whether the
  -- credential even resolves to a real registration.
  if not public.is_approved_director() or not exists (
    select 1 from public.tournaments t
     where t.id = p_tournament_id
       and t.director_id = auth.uid()
  ) then
    return query select 'unauthorized'::text, 'not_tournament_director'::text,
      null::uuid, null::text, null::text, null::text, null::timestamp with time zone;
    return;
  end if;

  select * into v_reg
    from public.registrations r
   where r.id = p_registration_id
   for update;

  if not found then
    return query select 'not_found'::text, 'invalid_credential'::text,
      null::uuid, null::text, null::text, null::text, null::timestamp with time zone;
    return;
  end if;

  select t.name into v_tournament_name from public.tournaments t where t.id = p_tournament_id;

  -- Cross-tournament protection (Phase 5.1 Step 10): the registration must
  -- belong to the exact tournament the director is currently managing, not
  -- merely to some tournament that director directs.
  if v_reg.tournament_id <> p_tournament_id then
    return query select 'wrong_tournament'::text, 'tournament_mismatch'::text,
      v_reg.id, null::text, null::text, null::text, null::timestamp with time zone;
    return;
  end if;

  select p.full_name into v_player_name from public.profiles p where p.id = v_reg.player_id;
  select d.name into v_division_name from public.divisions d where d.id = v_reg.division_id;

  if v_reg.status = 'checked_in' then
    return query select 'already_checked_in'::text, null::text,
      v_reg.id, v_player_name, v_division_name, v_tournament_name, v_reg.checked_in_at;
    return;
  end if;

  -- Eligible-for-check-in statuses mirror the existing manual check-in
  -- screen's own filter (apps/mobile/src/app/tournament/[id]/check-in.tsx
  -- excludes only 'cancelled'/'no_show' from the actionable list, and
  -- registrations.ts's dbStatusToAppStatus() maps 'substitute' to the same
  -- app-level 'registered' bucket as 'registered' itself). Anything else
  -- (held, withdrawn, disqualified, no_show, waitlisted, waitlist_offered,
  -- expired_hold) is not eligible and must not be checked in.
  if v_reg.status not in ('registered', 'substitute') then
    return query select 'ineligible'::text, v_reg.status::text,
      v_reg.id, v_player_name, v_division_name, v_tournament_name, null::timestamp with time zone;
    return;
  end if;

  update public.registrations as r
     set status = 'checked_in',
         checked_in_at = now(),
         checked_in_by = auth.uid(),
         updated_at = now()
   where r.id = v_reg.id
  returning r.checked_in_at into v_reg.checked_in_at;

  return query select 'success'::text, null::text,
    v_reg.id, v_player_name, v_division_name, v_tournament_name, v_reg.checked_in_at;
end;
$$;

ALTER FUNCTION "public"."check_in_registration"("p_registration_id" "uuid", "p_tournament_id" "uuid") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."check_in_registration"("p_registration_id" "uuid", "p_tournament_id" "uuid") TO "authenticated";
