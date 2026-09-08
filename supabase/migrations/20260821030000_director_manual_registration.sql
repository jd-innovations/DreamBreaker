-- ─────────────────────────────────────────────────────────────────────────────
-- Director manual registration — free divisions only, phase 1.
--
-- Primary principle: a director-added registration is a NORMAL tournament
-- registration, not a second class of registration. It lands in `registrations`
-- with the same status enum, fires the same triggers (spots_filled accounting,
-- registration-close enforcement, notifications), and is read by check-in and
-- bracket generation through the queries that already exist. Nothing downstream
-- needs to know it came from a director.
--
-- ── What already existed (audit, 2026-08-21) ────────────────────────────────
--   * `registrations.director_added` / `.added_by_director_id` — the schema was
--     already modelled for this.
--   * `personal_guest_players` — a real guest-player model (display_name, phone,
--     email, estimated_skill, gender, age_group, created_by) with NO auth user
--     behind it. Reused here rather than inventing a tournament-specific one.
--   * `personal_session_participants` — the established profile-XOR-guest
--     identity pattern, mirrored below.
--   * RLS policy "registrations: director insert manual" — allowed a direct
--     client-side INSERT with only identity + tournament-ownership checks. No
--     division/tournament relationship check, no free-division check, no
--     capacity check, no duplicate check. It is dropped at the bottom of this
--     file: the RPC is now the only way in.
--
-- ── Out of scope, deliberately ──────────────────────────────────────────────
-- Paid manual registration, director-collected Stripe payment, cash accounting,
-- comped entries, email invitations, CSV import, waitlist changes. The RPC
-- refuses any division with a non-zero entry fee rather than guessing. Adding
-- paid support later means relaxing that one guard and passing a payment
-- reference — the registration shape itself does not change.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Guest identity on registrations ──────────────────────────────────────
-- The smallest domain-appropriate extension: two nullable FKs and the same XOR
-- constraint personal_session_participants already uses. player_id loses its
-- NOT NULL because a guest registration has no profile behind it.

ALTER TABLE "public"."registrations"
  ALTER COLUMN "player_id" DROP NOT NULL;

ALTER TABLE "public"."registrations"
  ADD COLUMN IF NOT EXISTS "guest_player_id" uuid
    REFERENCES "public"."personal_guest_players"("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "guest_partner_id" uuid
    REFERENCES "public"."personal_guest_players"("id") ON DELETE RESTRICT;

-- Exactly one identity per registration.
ALTER TABLE "public"."registrations"
  ADD CONSTRAINT "registrations_one_identity" CHECK (
    (("player_id" IS NOT NULL) AND ("guest_player_id" IS NULL))
    OR
    (("player_id" IS NULL) AND ("guest_player_id" IS NOT NULL))
  );

-- A partner may be a profile or a guest, never both.
ALTER TABLE "public"."registrations"
  ADD CONSTRAINT "registrations_one_partner_identity" CHECK (
    NOT (("partner_id" IS NOT NULL) AND ("guest_partner_id" IS NOT NULL))
  );

CREATE INDEX IF NOT EXISTS "idx_registrations_guest_player"
  ON "public"."registrations" ("guest_player_id") WHERE "guest_player_id" IS NOT NULL;

COMMENT ON COLUMN "public"."registrations"."guest_player_id" IS
  'Set instead of player_id when a director registers someone with no app account. References personal_guest_players -- a pure data row, never a Supabase Auth user.';

-- ── 2. Duplicate enforcement has to cover guests ────────────────────────────
-- fn_enforce_single_division compares `player_id = new.player_id`. For a guest
-- registration both sides are NULL, so the comparison is NULL and the guard
-- silently never fires -- the same guest could be added repeatedly. Extend it
-- to check whichever identity the row actually carries.
CREATE OR REPLACE FUNCTION "public"."fn_enforce_single_division"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.player_id is not null and exists (
    select 1 from public.registrations
     where tournament_id = new.tournament_id
       and player_id = new.player_id
       and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000')
  ) then
    raise exception 'Player % is already registered for tournament %.', new.player_id, new.tournament_id using errcode = 'P0003';
  end if;

  if new.guest_player_id is not null and exists (
    select 1 from public.registrations
     where tournament_id = new.tournament_id
       and guest_player_id = new.guest_player_id
       and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000')
  ) then
    raise exception 'Guest % is already registered for tournament %.', new.guest_player_id, new.tournament_id using errcode = 'P0003';
  end if;

  return new;
end; $$;

-- ── 3. The RPC ──────────────────────────────────────────────────────────────
-- Narrowly scoped, SECURITY DEFINER, and the ONLY supported way for a director
-- to add a registration. SECURITY DEFINER is required for two reasons:
-- personal_guest_players has no INSERT policy at all (guest rows can only be
-- created by a definer function), and the capacity check needs a row lock the
-- caller's own grants would not reliably give.
--
-- One participant per call for singles; for doubles both sides are supplied and
-- TWO registrations rows are written, cross-linked, matching what the
-- self-service paid flow produces (one row per player, each carrying partner_id).
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
  v_is_doubles     boolean;
  v_needs_partner  boolean;
  v_guest_id       uuid;
  v_partner_guest_id uuid;
  v_seats_needed   int;
  v_active_rows    int;
  v_row            public.registrations;
begin
  -- Authentication
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Director authorization: approved director AND director of THIS tournament.
  -- current_user_is_director() alone is not enough -- it only says "is a
  -- director somewhere".
  if not exists (
    select 1 from public.tournaments t
     where t.id = p_tournament_id and t.director_id = v_actor
  ) then
    raise exception 'not_tournament_director' using errcode = 'P0002';
  end if;

  if not public.is_approved_director() then
    raise exception 'director_not_approved' using errcode = 'P0003';
  end if;

  -- Division must belong to this tournament. Locked here: the capacity check
  -- below and the spots_filled increment done by trg_sync_spots_filled must not
  -- interleave with a concurrent registration.
  select * into v_division
    from public.divisions d
   where d.id = p_division_id and d.tournament_id = p_tournament_id
     for update;

  if not found then
    raise exception 'division_not_in_tournament' using errcode = 'P0004';
  end if;

  -- Free divisions only, this phase. Explicit refusal beats a silent $0
  -- registration against a division that charges.
  if coalesce(v_division.entry_fee_cents, 0) <> 0 then
    raise exception 'division_requires_payment' using errcode = 'P0005',
      hint = 'Manual registration is only supported for free divisions.';
  end if;

  -- Identity: exactly one of profile / guest, on each side.
  if (p_player_id is null) = (p_guest is null) then
    raise exception 'invalid_participant' using errcode = 'P0006',
      hint = 'Supply exactly one of p_player_id or p_guest.';
  end if;

  v_is_doubles := (p_partner_id is not null) or (p_partner_guest is not null);

  -- Partner requirement comes from divisions.format, never from the name.
  -- Production carries both a 'doubles' division named "Mixed Doubles" and a
  -- 'mixed_doubles' one, so name matching would misclassify real data. The
  -- client-side requiresPartner() helper in register.tsx does regex the name;
  -- that is a UI convenience and not the authority.
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

  -- Capacity. draw_size counts registration ROWS, matching how
  -- fn_sync_spots_filled maintains the counter (one increment per active row),
  -- so a doubles team consumes two seats.
  --
  -- Deliberately counts live rows rather than trusting divisions.spots_filled.
  -- That counter can drift: production currently has a division reading
  -- spots_filled = 26 against zero actual registrations, which would refuse
  -- every legitimate add. The row lock taken above serializes this count
  -- against concurrent inserts.
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

  -- Duplicate profiles. The guest equivalents are enforced by
  -- fn_enforce_single_division, which cannot help here because a guest row does
  -- not exist yet -- but the same person added twice in one call must still be
  -- refused.
  if p_player_id is not null and p_player_id = p_partner_id then
    raise exception 'duplicate_participant' using errcode = 'P0011',
      hint = 'A player cannot partner with themselves.';
  end if;

  -- Guest creation. The director owns the row, which is what the existing
  -- "personal_guest_players: creator read" policy keys on.
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

  -- Primary registration. status 'registered' (not 'held') -- there is no
  -- payment to wait for, so the row is final immediately.
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

  -- Doubles: the partner gets their own row, mirroring the self-service flow
  -- where each member of a team holds their own registrations row.
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

ALTER FUNCTION "public"."director_add_tournament_registration"(uuid, uuid, uuid, jsonb, uuid, jsonb) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."director_add_tournament_registration"(uuid, uuid, uuid, jsonb, uuid, jsonb) IS
  'Director-initiated manual registration for FREE divisions. Verifies the caller is the approved director of this tournament, that the division belongs to it and charges nothing, that capacity allows the seats, and that participants are not duplicated -- then writes normal registrations rows atomically. Guests are personal_guest_players rows; no Supabase Auth user is ever created.';

REVOKE EXECUTE ON FUNCTION "public"."director_add_tournament_registration"(uuid, uuid, uuid, jsonb, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION "public"."director_add_tournament_registration"(uuid, uuid, uuid, jsonb, uuid, jsonb) TO authenticated;

-- ── 4. Close the unrestricted insert path ───────────────────────────────────
-- With the RPC in place, a direct client INSERT would bypass every check above.
DROP POLICY IF EXISTS "registrations: director insert manual" ON "public"."registrations";
