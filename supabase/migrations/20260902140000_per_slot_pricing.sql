-- Per-slot pricing. Everyone reserves individually.
--
-- The format fixes how many slots exist — doubles 4, singles 2, ball machine 1
-- — and each person pays for the slots they take, for the reservation's whole
-- duration:
--
--   court share = slots x hours x base hourly rate  (rate is PER SLOT)
--   fee         = convenience fee x slots
--   charged     = share + fee
--
-- Book 2 slots on a doubles court for 2 hours: 4 slot-hours x rate, plus $4.
-- The other 2 slots stay up for grabs, and whoever takes them pays the same
-- way.
--
-- ── What this replaces ──────────────────────────────────────────────────────
--
-- Until now the ORGANIZER was charged for the whole court regardless of how
-- many slots they wanted, and a joiner paid a $2 fee with no share of the court
-- at all. Both are wrong under this model.
--
-- ⚠️ `courts.hourly_rate_cents` changes meaning: it is now the price for ONE
-- player for ONE hour, not the whole court. Existing rates were entered as
-- court rates and must be reviewed, or a full doubles hour charges four times
-- what the facility intends.
--
-- ── Money now accrues ───────────────────────────────────────────────────────
--
-- A reservation used to have one payer and one snapshot. It now collects money
-- as slots fill, so the reservation-level totals are a running sum over
-- CONFIRMED players, maintained by a trigger. Empty slots simply never earn:
-- the facility is paid for what sold, not for the court.

alter table public.reservation_players
  add column if not exists slots integer not null default 1 check (slots >= 1),
  add column if not exists court_share_cents integer not null default 0 check (court_share_cents >= 0),
  add column if not exists total_cents integer not null default 0 check (total_cents >= 0);

-- ── One person's share ──────────────────────────────────────────────────────
create or replace function public.reservation_slot_price_cents(
  p_reservation_id uuid,
  p_slots integer
)
returns table (court_share_cents integer, fee_cents integer, total_cents integer)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    round(r.base_price_cents * coalesce(r.duration_hours, 1) * greatest(p_slots, 1)
          * (100 - coalesce(r.flash_deal_discount_percent, 0)) / 100.0)::integer,
    (public.booking_convenience_fee_cents(1) * greatest(p_slots, 1))::integer,
    (round(r.base_price_cents * coalesce(r.duration_hours, 1) * greatest(p_slots, 1)
           * (100 - coalesce(r.flash_deal_discount_percent, 0)) / 100.0)
     + public.booking_convenience_fee_cents(1) * greatest(p_slots, 1))::integer
  from public.reservations r
  where r.id = p_reservation_id;
$fn$;

grant execute on function public.reservation_slot_price_cents(uuid, integer) to authenticated, service_role;

-- ── Reservation totals follow the players ───────────────────────────────────
-- Recomputed from CONFIRMED players only, so nothing counts toward what a
-- facility is owed until it has actually been paid.
create or replace function public.recompute_reservation_totals(p_reservation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_share integer;
  v_fee   integer;
  v_pct   numeric;
  v_comm  integer;
begin
  select coalesce(sum(court_share_cents), 0), coalesce(sum(service_fee_cents), 0)
    into v_share, v_fee
    from public.reservation_players
   where reservation_id = p_reservation_id and status = 'confirmed';

  select coalesce(commission_pct, 20) into v_pct
    from public.reservations where id = p_reservation_id;

  v_comm := round(v_share * v_pct / 100.0);

  update public.reservations
     set final_price_cents         = v_share,
         platform_commission_cents = v_comm,
         facility_net_cents        = v_share - v_comm,
         buyer_service_fee_cents   = v_fee,
         buyer_total_cents         = v_share + v_fee,
         updated_at                = now()
   where id = p_reservation_id;
end;
$fn$;

create or replace function public.trg_reservation_players_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.recompute_reservation_totals(coalesce(new.reservation_id, old.reservation_id));
  return coalesce(new, old);
end;
$fn$;

drop trigger if exists trg_reservation_players_totals on public.reservation_players;
create trigger trg_reservation_players_totals
  after insert or update or delete on public.reservation_players
  for each row execute function public.trg_reservation_players_totals();

-- ── Booking: the organizer takes slots, not the court ───────────────────────
create or replace function public.create_reservation(
  p_facility_id uuid,
  p_asset_type facility_asset_owner_type,
  p_asset_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_game_format reservation_game_format default null,
  p_hold_minutes integer default 10,
  p_slots integer default 1
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
  v_comm record;
  v_slots integer;
  v_price record;
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
    raise exception 'slot_in_past' using errcode = 'P0008', hint = 'Choose a start time in the future.';
  end if;

  if p_ends_at - p_starts_at > interval '4 hours' then
    raise exception 'booking_too_long' using errcode = 'P0009', hint = 'Bookings can be at most 4 hours.';
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

  -- You cannot reserve more slots than the game has.
  v_slots := least(greatest(coalesce(p_slots, 1), 1), v_max_players);

  perform pg_advisory_xact_lock(hashtextextended(p_asset_type::text || ':' || p_asset_id::text, 0));

  v_base_rate := coalesce(public.reservation_asset_hourly_rate_cents(p_asset_type, p_asset_id), 0);
  select * into v_deal from public.reservation_best_flash_deal(p_asset_type, p_asset_id, p_starts_at);
  select * into v_comm from public.facility_commission_pct(p_facility_id);

  v_hours := extract(epoch from (p_ends_at - p_starts_at)) / 3600.0;

  begin
    -- Money starts at zero. The trigger fills it in as players confirm, so a
    -- court with no paid slots owes the facility nothing.
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
      v_base_rate, v_deal.discount_percent, 0, v_deal.id,
      v_hours, v_comm.pct, v_comm.source,
      0, 0, 0, 0
    )
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0004', hint = 'This asset is already booked for an overlapping time.';
  end;

  select * into v_price from public.reservation_slot_price_cents(v_row.id, v_slots);

  -- The organizer is HELD like anyone else until they pay. Seating them
  -- confirmed here would count unpaid money toward the facility's total.
  insert into reservation_players (
    reservation_id, profile_id, is_organizer, status, hold_expires_at,
    slots, court_share_cents, service_fee_cents, total_cents
  )
  values (
    v_row.id, v_organizer, true, 'held', v_row.hold_expires_at,
    v_slots, v_price.court_share_cents, v_price.fee_cents, v_price.total_cents
  );

  return v_row;
end;
$fn$;

-- ── Joining: take some of the open slots ────────────────────────────────────
create or replace function public.join_reservation(
  p_reservation_id uuid,
  p_slots integer default 1
)
returns public.reservation_players
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_res reservations;
  v_taken integer;
  v_row reservation_players;
  v_user uuid := auth.uid();
  v_slots integer;
  v_price record;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_res from reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found' using errcode = 'P0002'; end if;

  if v_res.status not in ('held', 'confirmed') then
    raise exception 'reservation_not_joinable' using errcode = 'P0003';
  end if;

  if v_res.status = 'held' and v_res.hold_expires_at < now() then
    raise exception 'hold_expired' using errcode = 'P0004';
  end if;

  delete from reservation_players
   where reservation_id = p_reservation_id and profile_id = v_user
     and status = 'held' and coalesce(hold_expires_at, now()) <= now();

  if exists (select 1 from reservation_players
              where reservation_id = p_reservation_id and profile_id = v_user) then
    raise exception 'already_joined' using errcode = 'P0006';
  end if;

  -- Held slots count. Otherwise the last open slots sell to everyone who
  -- reaches checkout at the same moment.
  select coalesce(sum(slots), 0) into v_taken
    from reservation_players
   where reservation_id = p_reservation_id
     and (status = 'confirmed'
          or (status = 'held' and coalesce(hold_expires_at, now()) > now()));

  v_slots := greatest(coalesce(p_slots, 1), 1);

  if v_taken + v_slots > v_res.max_players then
    raise exception 'not_enough_slots' using errcode = 'P0005',
      hint = format('%s of %s slots are already taken.', v_taken, v_res.max_players);
  end if;

  select * into v_price from public.reservation_slot_price_cents(p_reservation_id, v_slots);

  insert into reservation_players (
    reservation_id, profile_id, is_organizer, status, hold_expires_at,
    slots, court_share_cents, service_fee_cents, total_cents
  )
  values (
    p_reservation_id, v_user, false,
    case when v_price.total_cents > 0 then 'held' else 'confirmed' end,
    case when v_price.total_cents > 0 then now() + interval '10 minutes' else null end,
    v_slots, v_price.court_share_cents, v_price.fee_cents, v_price.total_cents
  )
  returning * into v_row;

  return v_row;
end;
$fn$;

-- ── Confirming the organizer's own seat with their booking ──────────────────
create or replace function public.confirm_reservation(p_reservation_id uuid)
returns public.reservations
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_res reservations;
  v_user uuid := auth.uid();
  v_row reservations;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_res from reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found' using errcode = 'P0002'; end if;
  if v_res.organizer_id <> v_user then raise exception 'not_authorized' using errcode = 'P0003'; end if;
  if v_res.status <> 'held' then raise exception 'reservation_not_held' using errcode = 'P0004'; end if;
  if v_res.hold_expires_at < now() then raise exception 'hold_expired' using errcode = 'P0005'; end if;

  update reservations set status = 'confirmed', confirmed_at = now(), hold_expires_at = null
   where id = p_reservation_id
   returning * into v_row;

  -- The organizer's seat is paid for by the booking charge, so it confirms with
  -- it. The totals trigger picks their share up from here.
  update reservation_players
     set status = 'confirmed', hold_expires_at = null
   where reservation_id = p_reservation_id and is_organizer;

  return v_row;
end;
$fn$;

-- ── Occupancy counts SLOTS, not people ──────────────────────────────────────
create or replace function public.reservation_occupancy(p_reservation_id uuid)
returns table (current_players integer, max_players integer, pending_invites integer, status reservation_status)
language sql
stable
security definer
set search_path = public
as $fn$
  SELECT
    (SELECT coalesce(sum(slots), 0)::int FROM reservation_players
      WHERE reservation_id = p_reservation_id
        AND (status = 'confirmed'
             OR (status = 'held' AND coalesce(hold_expires_at, now()) > now()))),
    r.max_players,
    (SELECT count(*)::int FROM reservation_invites WHERE reservation_id = p_reservation_id AND status = 'pending'),
    r.status
  FROM reservations r WHERE r.id = p_reservation_id;
$fn$;

comment on column public.courts.hourly_rate_cents is
  'Price for ONE player for ONE hour. Not the whole court — a doubles court sells four of these per hour.';
