-- The time-slot picker was counting people, not slots.
--
-- reservation_occupancy() was taught to sum `slots` when per-slot pricing
-- landed. Its sibling reservation_occupancy_for_asset() was missed, and still
-- did count(*) over reservation_players. The two then disagreed about the same
-- booking: a court where one person holds three of four slots reported 3 from
-- one function and 1 from the other.
--
-- The picker reads the second one, so it advertised three openings where one
-- existed. join_reservation() counts slots and would have raised
-- reservation_full, so this could not oversell a court -- but it invited three
-- people to tap Join and be refused, which is its own kind of broken.
--
-- Brought in line with the sibling in both respects: sum the slots, and count
-- only seats that are actually taken. A held seat past its expiry belongs to
-- the sweeper, not to the roster, and reporting it as occupied hides a slot
-- that is genuinely free.

create or replace function public.reservation_occupancy_for_asset(
  p_asset_type facility_asset_owner_type,
  p_asset_id uuid,
  p_date date
)
returns table (
  reservation_id uuid,
  time_range tstzrange,
  current_players integer,
  max_players integer,
  status reservation_status,
  final_price_cents integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  SELECT
    r.id,
    r.time_range,
    (SELECT coalesce(sum(slots), 0)::int FROM reservation_players
      WHERE reservation_id = r.id
        AND (status = 'confirmed'
             OR (status = 'held' AND coalesce(hold_expires_at, now()) > now()))),
    r.max_players,
    r.status,
    r.final_price_cents
  FROM reservations r
  WHERE r.asset_type = p_asset_type
    AND r.asset_id = p_asset_id
    AND r.status IN ('held', 'confirmed')
    AND r.time_range && tstzrange(p_date::timestamptz, (p_date + 1)::timestamptz, '[)')
  ORDER BY lower(r.time_range) ASC;
$fn$;

comment on function public.reservation_occupancy_for_asset(facility_asset_owner_type, uuid, date) is
  'Occupancy per reservation for one asset on one day. current_players sums slots, not rows: one person can hold several of a game''s spots. Must stay in step with reservation_occupancy().';
