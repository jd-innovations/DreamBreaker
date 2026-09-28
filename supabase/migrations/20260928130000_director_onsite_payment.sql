-- ─────────────────────────────────────────────────────────────────────────────
-- Director on-site payment: day-of walk-ins in PAID divisions.
--
-- The owner collects day-of entry fees at the desk (cash, Venmo, Zelle...) and
-- deliberately NOT through the app. director_add_tournament_registration()
-- refused every priced division (division_requires_payment), so a paid
-- tournament could not take walk-ins at all.
--
-- ── Design (secure-design pass, 2026-09-28) ─────────────────────────────────
-- Money model. On-site money is RECORDED, never processed. It lives in its own
-- columns and never touches entry_fee_paid_cents / stripe_*_intent_id, which
-- fn_protect_registration_payment_fields() already reserves for the Stripe
-- webhook. Consequences, each checked in the code:
--   * Refunds: cancel-registration refunds only through a `payments` row
--     (compute_registration_refund -> entry_payment_id). An on-site
--     registration has none, so no Stripe refund can ever be attempted for it.
--   * Payouts and director metrics read payments / entry_fee_paid_cents, so
--     on-site money cannot leak into Stripe-derived revenue or payouts.
--   * The app's balance-due calculation treats a recorded tender as settled
--     (client, registrations.ts).
--
-- Who can write the new columns: only this RPC (security definer, owner
-- postgres) or service_role. fn_protect_registration_onsite_fields() refuses
-- every other insert or change. It matters because "registrations: player
-- update own" lets a player UPDATE their own row (withdraw / waiver). Without
-- the guard, a player could mark themselves comped or paid in cash.
-- Directors' direct UPDATE policy is refused the same way; they record
-- tender only through the RPC, which re-checks director identity.
--
-- Input handling. The tender is an allowlist enforced twice: a CHECK
-- constraint and a check in the RPC. The amount is NEVER client-supplied: it
-- is the division's effective fee (0 when comped), resolved exactly as
-- create-tournament-entry-payment-intent does.
--
-- Scope: set at creation only. Correcting a recorded tender afterwards is not
-- supported yet.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columns ──────────────────────────────────────────────────────────────

alter table public.registrations
  add column if not exists onsite_tender text,
  add column if not exists onsite_amount_cents integer,
  add column if not exists onsite_recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists onsite_recorded_at timestamptz;

alter table public.registrations
  add constraint registrations_onsite_tender_valid
    check (onsite_tender is null or onsite_tender in ('cash', 'other', 'comp'));

-- Tender and amount travel together; a comp is always zero.
alter table public.registrations
  add constraint registrations_onsite_consistent check (
    (onsite_tender is null and onsite_amount_cents is null)
    or (onsite_tender is not null and onsite_amount_cents is not null
        and onsite_amount_cents >= 0
        and (onsite_tender <> 'comp' or onsite_amount_cents = 0))
  );

comment on column public.registrations.onsite_tender is
  'Day-of payment the director collected OUTSIDE the app: cash | other | comp. '
  'Recorded only, never processed or refunded through Stripe. Writable only by '
  'director_add_tournament_registration() / service_role.';

-- ── 2. Guard: only the RPC / service_role may write on-site fields ──────────

create or replace function public.fn_protect_registration_onsite_fields()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Inside a SECURITY DEFINER function owned by postgres, current_user is
  -- postgres; a direct PostgREST write runs as authenticated/anon.
  if current_user = 'postgres' or auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.onsite_tender is not null or new.onsite_amount_cents is not null
       or new.onsite_recorded_by is not null or new.onsite_recorded_at is not null then
      raise exception 'onsite payment fields may only be set by director_add_tournament_registration()'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.onsite_tender is distinct from old.onsite_tender
     or new.onsite_amount_cents is distinct from old.onsite_amount_cents
     or new.onsite_recorded_by is distinct from old.onsite_recorded_by
     or new.onsite_recorded_at is distinct from old.onsite_recorded_at then
    raise exception 'onsite payment fields may only be changed by director_add_tournament_registration()'
      using errcode = '42501';
  end if;

  return new;
end; $$;

alter function public.fn_protect_registration_onsite_fields() owner to postgres;

drop trigger if exists trg_protect_registration_onsite_fields on public.registrations;
create trigger trg_protect_registration_onsite_fields
  before insert or update on public.registrations
  for each row execute function public.fn_protect_registration_onsite_fields();

-- ── 3. RPC: accept a tender for priced divisions ────────────────────────────
-- New trailing parameter, so the old 6-argument signature is dropped rather
-- than left as an overload that still refuses paid divisions.

drop function if exists public.director_add_tournament_registration(uuid, uuid, uuid, jsonb, uuid, jsonb);

create function public.director_add_tournament_registration(
  p_tournament_id uuid,
  p_division_id uuid,
  p_player_id uuid default null,
  p_guest jsonb default null,
  p_partner_id uuid default null,
  p_partner_guest jsonb default null,
  p_onsite_tender text default null
)
returns public.registrations
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor          uuid := auth.uid();
  v_division       public.divisions;
  v_tournament_fee integer;
  v_effective_fee  integer;
  v_tender         text;
  v_onsite_amount  integer;
  v_recorded_at    timestamptz;
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

  -- Priced division: the director must say how the fee was settled on site.
  -- The amount is derived here, never taken from the client.
  if v_effective_fee <> 0 then
    v_tender := nullif(btrim(lower(coalesce(p_onsite_tender, ''))), '');
    if v_tender is null then
      raise exception 'division_requires_payment' using errcode = 'P0005',
        hint = 'Priced division: pass p_onsite_tender (cash | other | comp).';
    end if;
    if v_tender not in ('cash', 'other', 'comp') then
      raise exception 'invalid_onsite_tender' using errcode = 'P0012',
        hint = 'p_onsite_tender must be cash, other or comp.';
    end if;
    v_onsite_amount := case when v_tender = 'comp' then 0 else v_effective_fee end;
    v_recorded_at := now();
  else
    -- Free division: nothing to record, whatever the client sent.
    v_tender := null;
    v_onsite_amount := null;
    v_recorded_at := null;
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

  -- Each player on a team pays their own entry fee, so each row records it.
  insert into public.registrations (
    tournament_id, division_id, player_id, guest_player_id,
    partner_id, guest_partner_id, status,
    entry_fee_paid_cents, hold_fee_paid_cents,
    needs_partner, director_added, added_by_director_id,
    onsite_tender, onsite_amount_cents, onsite_recorded_by, onsite_recorded_at
  ) values (
    p_tournament_id, p_division_id, p_player_id, v_guest_id,
    p_partner_id, v_partner_guest_id, 'registered',
    0, 0,
    false, true, v_actor,
    v_tender, v_onsite_amount, case when v_tender is null then null else v_actor end, v_recorded_at
  )
  returning * into v_row;

  if v_is_doubles then
    insert into public.registrations (
      tournament_id, division_id, player_id, guest_player_id,
      partner_id, guest_partner_id, status,
      entry_fee_paid_cents, hold_fee_paid_cents,
      needs_partner, director_added, added_by_director_id,
      onsite_tender, onsite_amount_cents, onsite_recorded_by, onsite_recorded_at
    ) values (
      p_tournament_id, p_division_id, p_partner_id, v_partner_guest_id,
      p_player_id, v_guest_id, 'registered',
      0, 0,
      false, true, v_actor,
      v_tender, v_onsite_amount, case when v_tender is null then null else v_actor end, v_recorded_at
    );
  end if;

  return v_row;
end;
$$;

alter function public.director_add_tournament_registration(uuid, uuid, uuid, jsonb, uuid, jsonb, text) owner to postgres;

-- Same grants the 6-argument version had: authenticated + service_role, not
-- PUBLIC / anon.
revoke all on function public.director_add_tournament_registration(uuid, uuid, uuid, jsonb, uuid, jsonb, text) from public;
revoke all on function public.director_add_tournament_registration(uuid, uuid, uuid, jsonb, uuid, jsonb, text) from anon;
grant execute on function public.director_add_tournament_registration(uuid, uuid, uuid, jsonb, uuid, jsonb, text) to authenticated, service_role;
