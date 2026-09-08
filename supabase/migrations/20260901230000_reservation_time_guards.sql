-- create_reservation accepted a slot in the past.
--
-- Found in testing: the client offered past hours and the RPC took them. It
-- also matters for money — a booking dated last week is instantly older than
-- the 48h settlement hold, so it becomes payable on the next payout run
-- without anyone ever having played.
--
-- Also enforces the spec's stated maximum booking length of 4 hours
-- (BOOKING_ENGINE_V1_SPEC.md, Reservation Rules). Nothing enforced it before,
-- and now that pricing multiplies by duration, a very long booking is a very
-- large charge.
--
-- Everything else is the function as it stood; only the two guards are new.
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

  -- A slot that has already begun cannot be reserved.
  if p_starts_at < now() then
    raise exception 'slot_in_past' using errcode = 'P0008',
      hint = 'Choose a start time in the future.';
  end if;

  -- Spec: default booking length 1 hour, maximum 4.
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
