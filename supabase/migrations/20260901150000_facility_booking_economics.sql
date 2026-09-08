-- Facility Marketplace Phase 4 — booking economics.
--
-- Until now create-booking-payment-intent charged final_price_cents and
-- stopped: no fee split, no destination, no record of what the facility was
-- owed. Coach purchases have snapshotted gross / commission / net with CHECK
-- constraints since Phase 3 of that build; reservations had base, discount and
-- final only. This closes that gap.
--
-- Snapshot, not computed on read: a commission rate that changes next month
-- must not silently restate what a facility earned last month.
--
-- ── A pricing bug fixed on the way past ─────────────────────────────────────
--
-- create_reservation computed
--     final_price_cents = hourly_rate * (100 - discount) / 100
-- with no duration multiplier. Every reservation in production is exactly one
-- hour, so it has never shown — but the RPC accepts an arbitrary p_ends_at and
-- is callable directly, so a six-hour booking cost one hour. Building a
-- percentage split on top of an understated gross would have quietly
-- underpaid the facility on every long booking.
--
-- The multiplier is 1 for a one-hour slot, so no existing behaviour changes.

-- ── Rates ───────────────────────────────────────────────────────────────────

insert into public.platform_settings (key, value, value_type, label, description, sort_order)
values ('facility_marketplace_base_commission_pct', '20', 'number',
        'Facility booking commission (%)',
        'Platform share of a court or ball-machine booking. Overridable per facility.',
        910)
on conflict (key) do nothing;

alter table public.facilities
  -- Admin-set, NOT facility-set. Guarded below: a venue that could set its own
  -- commission to zero would simply do so.
  add column if not exists commission_override_pct numeric
    check (commission_override_pct is null
           or (commission_override_pct >= 0 and commission_override_pct <= 100)),
  -- The facility's own policy, and theirs to set. Capped at a week so a venue
  -- cannot make every booking non-refundable by entering 100000.
  add column if not exists cancellation_window_hours integer not null default 24
    check (cancellation_window_hours >= 0 and cancellation_window_hours <= 168);

-- Deliberately NO per-deal override, unlike coach_offers.commission_override_pct.
-- Facility managers own flash_deals (they have insert/update RLS on it), so a
-- column there would let them set their own commission. Two tiers only, both
-- admin-controlled.

create or replace function public.facility_commission_pct(p_facility_id uuid)
returns table (pct numeric, source text)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    coalesce(
      f.commission_override_pct,
      (select value::numeric from public.platform_settings
        where key = 'facility_marketplace_base_commission_pct'),
      20)::numeric,
    case when f.commission_override_pct is not null then 'facility' else 'platform' end
  from public.facilities f
  where f.id = p_facility_id;
$fn$;

-- ── The snapshot ────────────────────────────────────────────────────────────

alter table public.reservations
  add column if not exists duration_hours numeric,
  add column if not exists commission_pct numeric,
  add column if not exists commission_source text,
  add column if not exists platform_commission_cents integer,
  add column if not exists facility_net_cents integer;

-- Arithmetic enforced in the database, as it is for coach purchases. A split
-- that does not add up is money unaccounted for, and finding that later means
-- reconciling against Stripe by hand.
--
-- NOT VALID: the nine pre-marketplace test bookings predate these columns and
-- carry nulls. New and updated rows are checked; history is left alone.
alter table public.reservations
  drop constraint if exists reservations_split_adds_up;
alter table public.reservations
  add constraint reservations_split_adds_up check (
    platform_commission_cents is null
    or facility_net_cents is null
    or final_price_cents is null
    or facility_net_cents = final_price_cents - platform_commission_cents
  ) not valid;

-- ── Pricing, with the duration fix and the split ────────────────────────────

create or replace function public.create_reservation(
  p_facility_id uuid,
  p_asset_type facility_asset_owner_type,
  p_asset_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  -- Defaults preserved exactly. Dropping them is not a silent change: Postgres
  -- refuses the CREATE OR REPLACE outright, and every existing caller that
  -- omits these arguments would break.
  p_game_format reservation_game_format default null,
  p_hold_minutes integer default 10
)
returns public.reservations
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_organizer uuid := auth.uid();
  v_resolved_facility uuid;
  v_max_players smallint;
  v_base_rate integer;
  v_deal record;
  v_row public.reservations;
  v_hours numeric;
  v_final integer;
  v_comm record;
  v_commission_cents integer;
begin
  if v_organizer is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_asset_type not in ('court', 'ball_machine') then
    raise exception 'invalid_asset_type' using errcode = 'P0002';
  end if;

  v_resolved_facility := public.facility_id_for_owner(p_asset_type, p_asset_id);
  if v_resolved_facility is null or v_resolved_facility <> p_facility_id then
    raise exception 'asset_not_found' using errcode = 'P0003', hint = 'Asset does not belong to the given facility.';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'invalid_time_range' using errcode = 'P0007';
  end if;

  if p_asset_type = 'ball_machine' then
    if p_game_format is not null then
      raise exception 'invalid_game_format_for_ball_machine' using errcode = 'P0005';
    end if;
    v_max_players := 1;
  else
    if p_game_format is null then
      raise exception 'game_format_required' using errcode = 'P0006';
    end if;
    v_max_players := case p_game_format when 'singles' then 2 when 'doubles' then 4 end;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_asset_type::text || ':' || p_asset_id::text, 0));

  v_base_rate := coalesce(public.reservation_asset_hourly_rate_cents(p_asset_type, p_asset_id), 0);
  select * into v_deal from public.reservation_best_flash_deal(p_asset_type, p_asset_id, p_starts_at);

  -- The fix: the rate is per HOUR, so the charge scales with the booking.
  v_hours := extract(epoch from (p_ends_at - p_starts_at)) / 3600.0;
  v_final := round(v_base_rate * v_hours * (100 - coalesce(v_deal.discount_percent, 0)) / 100.0);

  select * into v_comm from public.facility_commission_pct(p_facility_id);
  -- Rounded once, and the net is the remainder, so the two always sum to the
  -- charge no matter how the rounding falls.
  v_commission_cents := round(v_final * v_comm.pct / 100.0);

  begin
    insert into reservations (
      facility_id, asset_type, asset_id, organizer_id, game_format, max_players,
      time_range, status, hold_expires_at, base_price_cents,
      flash_deal_discount_percent, final_price_cents, flash_deal_id,
      duration_hours, commission_pct, commission_source,
      platform_commission_cents, facility_net_cents
    ) values (
      p_facility_id, p_asset_type, p_asset_id, v_organizer, p_game_format, v_max_players,
      tstzrange(p_starts_at, p_ends_at, '[)'), 'held', now() + make_interval(mins => p_hold_minutes),
      v_base_rate, v_deal.discount_percent, v_final, v_deal.id,
      v_hours, v_comm.pct, v_comm.source,
      v_commission_cents, v_final - v_commission_cents
    )
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0004', hint = 'This asset is already booked for an overlapping time.';
  end;

  insert into reservation_players (reservation_id, profile_id, is_organizer)
  values (v_row.id, v_organizer, true);

  return v_row;
end;
$fn$;

-- ── Who is owed what ────────────────────────────────────────────────────────
--
-- The payout view Phase 7 will drain. Eligibility follows the decisions made
-- for this build: the slot has elapsed AND the booking was confirmed, OR it
-- was cancelled too late to matter — the court was held either way, and a
-- no-show still consumed it.
--
-- security_invoker + service_role only. A plain view runs as its OWNER, which
-- on the coach build would have exposed every coach's payable rows to any
-- authenticated caller.
create or replace view public.v_facility_payable_reservations
with (security_invoker = true) as
select
  r.id as reservation_id,
  r.facility_id,
  r.final_price_cents,
  r.platform_commission_cents,
  r.facility_net_cents,
  lower(r.time_range) as slot_start,
  r.status
from public.reservations r
join public.facilities f on f.id = r.facility_id
where r.facility_net_cents is not null
  and upper(r.time_range) <= now()
  and f.payouts_ready = true
  and (
    r.status = 'confirmed'
    or (r.status = 'cancelled'
        and r.cancelled_at > lower(r.time_range) - make_interval(hours => f.cancellation_window_hours))
  );

revoke all on public.v_facility_payable_reservations from anon, authenticated;
grant select on public.v_facility_payable_reservations to service_role;

comment on view public.v_facility_payable_reservations is
  'Reservations a facility is owed for: the slot has elapsed and it was confirmed, or cancelled too late to release the court. No-shows pay, by decision.';

comment on column public.reservations.facility_net_cents is
  'What the facility is owed, snapshotted at booking. Never recomputed — a later rate change must not restate past earnings.';
