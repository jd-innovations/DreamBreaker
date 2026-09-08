-- The convenience fee is per PLAYER SLOT, not per hour.
--
-- Corrected twice. The first cut charged a flat $2 per booking; the second
-- multiplied by hours, which was a misreading of "per slot" — the user never
-- said hour. The rule is: booking for 1 player costs $2, for 2 players $4.
-- Duration does not affect it, so a 3-hour doubles booking carries the same
-- fee as a 1-hour one.
--
-- The count comes from the group size the booker already declares during
-- search (bookingStore.playersInGroup, shown in the Choose Time header as
-- "Doubles (4 players)"), passed as p_players. It is clamped to the court's
-- capacity so a caller cannot inflate the fee — or, by passing 0, avoid it.
create or replace function public.booking_convenience_fee_cents(p_players integer default 1)
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
      * greatest(coalesce(p_players, 1), 1)
  end;
$fn$;

grant execute on function public.booking_convenience_fee_cents(integer) to authenticated, service_role;

-- The per-hour overload from the previous migration. Dropped rather than left
-- as an overload a two-argument call would silently resolve to.
drop function if exists public.booking_convenience_fee_cents(integer, numeric);

update public.platform_settings
   set label = 'Court Booking: Convenience Fee Per Player (cents)',
       description = 'Charged per player on the booking. Booking for 4 costs four times this. Platform revenue; never counts toward what a facility is owed.'
 where key = 'facility_booking_convenience_fee_cents';

-- Superseded: the fee is per player by definition now, so a separate
-- per-player multiplier would double-count.
update public.platform_settings
   set label = 'Court Booking: Charge Fee Per Player (superseded)',
       description = 'No longer used. The convenience fee is per player by definition; this setting is ignored.'
 where key = 'facility_booking_convenience_fee_per_player';

-- create_reservation takes the group size and charges the fee per player.
--
-- p_players has a default so every existing caller keeps working; the client
-- passes bookingStore.playersInGroup. It is clamped to the court's capacity in
-- BOTH directions: a caller cannot inflate the fee past what the court seats,
-- nor pass 0 to avoid it.
create or replace function public.create_reservation(
  p_facility_id uuid,
  p_asset_type facility_asset_owner_type,
  p_asset_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_game_format reservation_game_format default null,
  p_hold_minutes integer default 10,
  p_players integer default 1
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
  v_players integer;
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
  v_commission_cents := round(v_final * v_comm.pct / 100.0);

  v_players := least(greatest(coalesce(p_players, 1), 1), v_max_players);

  v_fee := case when v_final > 0
                then public.booking_convenience_fee_cents(v_players)
                else 0 end;

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
