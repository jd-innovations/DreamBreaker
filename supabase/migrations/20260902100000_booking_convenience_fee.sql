-- A convenience fee on court bookings. $2 by default, admin-adjustable.
--
-- ── Where the fee sits, and why it matters ──────────────────────────────────
--
-- The fee is PLATFORM revenue. It must not touch the facility's side of the
-- ledger, so it is deliberately NOT added to final_price_cents:
--
--   final_price_cents          the court price (unchanged)
--   platform_commission_cents  pct x final_price_cents (unchanged)
--   facility_net_cents         final_price_cents - commission (unchanged)
--   buyer_service_fee_cents    the fee, on top
--   buyer_total_cents          what the player is actually charged
--
-- Folding the fee into final_price_cents instead would do two wrong things at
-- once: inflate the commission base, and — far worse — inflate
-- facility_net_cents, so the weekly payout runner would transfer our own fee
-- to the facility. That is the most expensive mistake available in this change,
-- which is why the split is structural rather than a convention to remember.
--
-- Naming follows coach_offer_purchases.buyer_service_fee_cents, which is the
-- same concept on the coach side.

insert into public.platform_settings (key, value, value_type, label, description, sort_order)
values
  ('facility_booking_convenience_fee_enabled', 'true', 'boolean',
   'Court Booking: Convenience Fee',
   'When off, no convenience fee is added to court bookings.', 930),
  ('facility_booking_convenience_fee_cents', '200', 'number',
   'Court Booking: Convenience Fee Amount (cents)',
   'Added to every court booking as platform revenue. Never counts toward what a facility is owed.', 931),
  -- GolfNow charges its fee per player, per tee time. Off by default: charging
  -- a joiner their own fee needs a payment step join_reservation() does not
  -- have yet, so with this ON the organizer pays for every seat at booking.
  ('facility_booking_convenience_fee_per_player', 'false', 'boolean',
   'Court Booking: Charge Fee Per Player',
   'When on, the fee is multiplied by the court capacity and paid by the organizer at booking.', 932)
on conflict (key) do nothing;

alter table public.reservations
  add column if not exists buyer_service_fee_cents integer not null default 0
    check (buyer_service_fee_cents >= 0),
  add column if not exists buyer_total_cents integer;

-- The charge equals the court price plus the fee. NOT VALID because rows that
-- predate this migration carry a null buyer_total_cents; new and updated rows
-- are checked.
alter table public.reservations
  drop constraint if exists reservations_buyer_total_adds_up;
alter table public.reservations
  add constraint reservations_buyer_total_adds_up check (
    buyer_total_cents is null
    or final_price_cents is null
    or buyer_total_cents = final_price_cents + buyer_service_fee_cents
  ) not valid;

-- Backfill so existing bookings have a total to charge/refund against.
update public.reservations
   set buyer_total_cents = final_price_cents + buyer_service_fee_cents
 where buyer_total_cents is null and final_price_cents is not null;

create or replace function public.booking_convenience_fee_cents(p_max_players integer default 1)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when coalesce((select value from public.platform_settings
                    where key = 'facility_booking_convenience_fee_enabled'), 'true') <> 'true'
      then 0
    else
      coalesce((select value::integer from public.platform_settings
                 where key = 'facility_booking_convenience_fee_cents'), 200)
      * case when coalesce((select value from public.platform_settings
                             where key = 'facility_booking_convenience_fee_per_player'), 'false') = 'true'
             then greatest(coalesce(p_max_players, 1), 1)
             else 1 end
  end;
$fn$;

grant execute on function public.booking_convenience_fee_cents(integer) to authenticated, service_role;

-- ── create_reservation, with the fee ────────────────────────────────────────
-- Everything else is unchanged: duration pricing, flash deals, slot_in_past,
-- the 4-hour ceiling, the advisory lock and the overlap handling.
create or replace function public.create_reservation(
  p_facility_id uuid,
  p_asset_type facility_asset_owner_type,
  p_asset_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
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
  v_fee integer;
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

  if p_starts_at < now() then
    raise exception 'slot_in_past' using errcode = 'P0008',
      hint = 'Choose a start time in the future.';
  end if;

  if p_ends_at - p_starts_at > interval '4 hours' then
    raise exception 'booking_too_long' using errcode = 'P0009',
      hint = 'Bookings can be at most 4 hours.';
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

  v_hours := extract(epoch from (p_ends_at - p_starts_at)) / 3600.0;
  v_final := round(v_base_rate * v_hours * (100 - coalesce(v_deal.discount_percent, 0)) / 100.0);

  select * into v_comm from public.facility_commission_pct(p_facility_id);
  -- Commission is on the COURT price only. The fee is ours and is not part of
  -- what the facility sold.
  v_commission_cents := round(v_final * v_comm.pct / 100.0);

  -- A free court gets no convenience fee: charging $2 to book something priced
  -- at zero is the kind of thing that gets screenshotted.
  v_fee := case when v_final > 0 then public.booking_convenience_fee_cents(v_max_players) else 0 end;

  begin
    insert into reservations (
      facility_id, asset_type, asset_id, organizer_id, game_format, max_players,
      time_range, status, hold_expires_at, base_price_cents,
      flash_deal_discount_percent, final_price_cents, flash_deal_id,
      duration_hours, commission_pct, commission_source,
      platform_commission_cents, facility_net_cents,
      buyer_service_fee_cents, buyer_total_cents
    ) values (
      p_facility_id, p_asset_type, p_asset_id, v_organizer, p_game_format, v_max_players,
      tstzrange(p_starts_at, p_ends_at, '[)'), 'held', now() + make_interval(mins => p_hold_minutes),
      v_base_rate, v_deal.discount_percent, v_final, v_deal.id,
      v_hours, v_comm.pct, v_comm.source,
      v_commission_cents, v_final - v_commission_cents,
      v_fee, v_final + v_fee
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

-- ── Refunds: the fee is kept ────────────────────────────────────────────────
-- Decision 2026-09-02: an early cancellation refunds the court price, never the
-- convenience fee. The fee is what stops cancelling being entirely free.
create or replace function public.compute_reservation_refund(p_reservation_id uuid)
returns table (
  refundable       boolean,
  refundable_cents integer,
  payment_id       uuid,
  window_hours     integer,
  hours_until_slot numeric,
  reason           text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_res     record;
  v_payment record;
  v_hours   numeric;
  v_refundable integer;
begin
  select r.id, r.status, r.facility_id, lower(r.time_range) as slot_start,
         coalesce(r.buyer_service_fee_cents, 0) as fee_cents,
         f.cancellation_window_hours
    into v_res
    from public.reservations r
    join public.facilities f on f.id = r.facility_id
   where r.id = p_reservation_id;

  if not found then
    return query select false, 0, null::uuid, 0, 0::numeric, 'reservation_not_found';
    return;
  end if;

  v_hours := extract(epoch from (v_res.slot_start - now())) / 3600.0;

  select p.id, p.amount_cents, p.refunded_amount_cents, p.status
    into v_payment
    from public.payments p
   where p.purpose_type = 'reservation_payment'
     and p.purpose_id = p_reservation_id
     and p.status in ('succeeded', 'refunded', 'partially_refunded')
   order by p.created_at desc
   limit 1;

  if v_payment.id is null then
    return query select false, 0, null::uuid, v_res.cancellation_window_hours, v_hours, 'no_settled_payment';
    return;
  end if;

  -- What was charged, less the fee we keep, less anything already returned.
  v_refundable := v_payment.amount_cents - v_res.fee_cents - v_payment.refunded_amount_cents;

  if v_refundable <= 0 then
    return query select false, 0, v_payment.id, v_res.cancellation_window_hours, v_hours, 'already_refunded';
    return;
  end if;

  if v_hours < v_res.cancellation_window_hours then
    return query select false, 0, v_payment.id, v_res.cancellation_window_hours, v_hours, 'inside_cancellation_window';
    return;
  end if;

  return query select true, v_refundable, v_payment.id,
                      v_res.cancellation_window_hours, v_hours, null::text;
end;
$fn$;

comment on column public.reservations.buyer_service_fee_cents is
  'Platform convenience fee. Deliberately outside final_price_cents so it never enters the commission base or facility_net_cents — otherwise the payout runner would transfer our own fee to the facility.';
