-- ─────────────────────────────────────────────────────────────────────────────
-- Fix the free-division check in director_add_tournament_registration().
--
-- 20260821030000 decided whether a division was free with:
--
--   if coalesce(v_division.entry_fee_cents, 0) <> 0 then ... refuse
--
-- That treats a NULL division fee as free. It is not. NULL means "inherit the
-- tournament's entry fee" — the semantics the division form's own hint states
-- ("leave blank to use the tournament's entry fee") and, more importantly, the
-- semantics the money already follows. create-tournament-entry-payment-intent
-- charges:
--
--   division.entry_fee_cents ?? tournament.entry_fee_cents ?? 0
--
-- So a division with a NULL fee inside a paid tournament charges real money,
-- and the old check would have let a director register someone into it for
-- nothing. Production has exactly that shape today: "Test payments" is a $50.00
-- tournament whose Mixed Doubles division has entry_fee_cents = NULL.
--
-- No such registration was ever created — the feature has not been used yet —
-- but the hole was real. This replaces the check with the same three-step
-- resolution the payment path uses, so "free" means the same thing to both.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."director_add_tournament_registration"(
    "p_tournament_id" uuid,
    "p_division_id" uuid,
    "p_player_id" uuid DEFAULT NULL,
    "p_guest" jsonb DEFAULT NULL,
    "p_partner_id" uuid DEFAULT NULL,
    "p_partner_guest" jsonb DEFAULT NULL
  ) RETURNS "public"."registrations"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
declare
  v_actor          uuid := auth.uid();
  v_division       public.divisions;
  v_tournament_fee integer;
  v_effective_fee  integer;
  v_is_doubles     boolean;
  v_needs_partner  boolean;
  v_guest_id       uuid;
  v_partner_guest_id uuid;
  v_seats_needed   int;
  v_active_rows    int;
  v_row            public.registrations;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Director authorization: approved director AND director of THIS tournament.
  select t.entry_fee_cents into v_tournament_fee
    from public.tournaments t
   where t.id = p_tournament_id and t.director_id = v_actor;

  if not found then
    raise exception 'not_tournament_director' using errcode = 'P0002';
  end if;

  if not public.is_approved_director() then
    raise exception 'director_not_approved' using errcode = 'P0003';
  end if;

  -- Division must belong to this tournament. Locked so the capacity count below
  -- cannot interleave with a concurrent registration.
  select * into v_division
    from public.divisions d
   where d.id = p_division_id and d.tournament_id = p_tournament_id
     for update;

  if not found then
    raise exception 'division_not_in_tournament' using errcode = 'P0004';
  end if;

  -- Effective fee, matching create-tournament-entry-payment-intent exactly:
  -- the division's own fee if set, otherwise the tournament's, otherwise free.
  v_effective_fee := coalesce(v_division.entry_fee_cents, v_tournament_fee, 0);

  if v_effective_fee <> 0 then
    raise exception 'division_requires_payment' using errcode = 'P0005',
      hint = 'Manual registration is only supported for free divisions.';
  end if;

  if (p_player_id is null) = (p_guest is null) then
    raise exception 'invalid_participant' using errcode = 'P0006',
      hint = 'Supply exactly one of p_player_id or p_guest.';
  end if;

  v_is_doubles := (p_partner_id is not null) or (p_partner_guest is not null);
  v_needs_partner := v_division.format in ('doubles', 'mixed_doubles');

  if (p_partner_id is not null) and (p_partner_guest is not null) then
    raise exception 'invalid_partner' using errcode = 'P0007',
      hint = 'Supply at most one of p_partner_id or p_partner_guest.';
  end if;

  if v_needs_partner and not v_is_doubles then
    raise exception 'partner_required' using errcode = 'P0008',
      hint = 'This division is doubles -- a partner is required.';
  end if;

  if v_is_doubles and not v_needs_partner then
    raise exception 'partner_not_allowed' using errcode = 'P0009',
      hint = 'This division is singles -- no partner may be supplied.';
  end if;

  v_seats_needed := case when v_is_doubles then 2 else 1 end;

  select count(*) into v_active_rows
    from public.registrations r
   where r.division_id = p_division_id
     and r.status in ('held', 'registered', 'checked_in', 'substitute');

  if v_division.draw_size > 0
     and (v_active_rows + v_seats_needed) > v_division.draw_size then
    raise exception 'division_full' using errcode = 'P0010',
      hint = 'Not enough remaining spots in this division.';
  end if;

  if p_player_id is not null and p_player_id = p_partner_id then
    raise exception 'duplicate_participant' using errcode = 'P0011',
      hint = 'A player cannot partner with themselves.';
  end if;

  if p_guest is not null then
    insert into public.personal_guest_players (created_by, display_name, phone, email, estimated_skill, gender, age_group)
    values (v_actor,
            btrim(coalesce(p_guest->>'display_name', '')),
            nullif(p_guest->>'phone', ''),
            nullif(p_guest->>'email', ''),
            nullif(p_guest->>'estimated_skill', ''),
            nullif(p_guest->>'gender', ''),
            nullif(p_guest->>'age_group', ''))
    returning id into v_guest_id;
  end if;

  if p_partner_guest is not null then
    insert into public.personal_guest_players (created_by, display_name, phone, email, estimated_skill, gender, age_group)
    values (v_actor,
            btrim(coalesce(p_partner_guest->>'display_name', '')),
            nullif(p_partner_guest->>'phone', ''),
            nullif(p_partner_guest->>'email', ''),
            nullif(p_partner_guest->>'estimated_skill', ''),
            nullif(p_partner_guest->>'gender', ''),
            nullif(p_partner_guest->>'age_group', ''))
    returning id into v_partner_guest_id;
  end if;

  insert into public.registrations (
    tournament_id, division_id, player_id, guest_player_id,
    partner_id, guest_partner_id, status,
    entry_fee_paid_cents, hold_fee_paid_cents,
    needs_partner, director_added, added_by_director_id
  ) values (
    p_tournament_id, p_division_id, p_player_id, v_guest_id,
    p_partner_id, v_partner_guest_id, 'registered',
    0, 0,
    false, true, v_actor
  )
  returning * into v_row;

  if v_is_doubles then
    insert into public.registrations (
      tournament_id, division_id, player_id, guest_player_id,
      partner_id, guest_partner_id, status,
      entry_fee_paid_cents, hold_fee_paid_cents,
      needs_partner, director_added, added_by_director_id
    ) values (
      p_tournament_id, p_division_id, p_partner_id, v_partner_guest_id,
      p_player_id, v_guest_id, 'registered',
      0, 0,
      false, true, v_actor
    );
  end if;

  return v_row;
end;
$$;

REVOKE ALL ON FUNCTION "public"."director_add_tournament_registration"(uuid, uuid, uuid, jsonb, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."director_add_tournament_registration"(uuid, uuid, uuid, jsonb, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION "public"."director_add_tournament_registration"(uuid, uuid, uuid, jsonb, uuid, jsonb) TO authenticated;
