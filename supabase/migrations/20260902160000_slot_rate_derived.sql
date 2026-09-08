-- The court rate is PER COURT PER HOUR, as the facility profile says. The
-- per-slot rate is derived from it, never entered separately.
--
--   slot-hour price = court hourly rate / slots in the game
--   court share     = slots x hours x slot-hour price
--
-- A $50/hour doubles court: one slot-hour is $12.50, so 2 slots for 2 hours is
-- $50 - exactly half of the $100 that court costs for two hours. Four slots for
-- one hour is $50, the whole court. The parts always add up to the court, which
-- is the property that makes this checkable.
--
-- The previous version treated hourly_rate_cents as the per-slot rate, which
-- charged four times the court price for a full doubles game. A real 3-slot,
-- 3-hour booking on a $50 court came to $456 instead of $118.50.
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
    round(
      (r.base_price_cents::numeric / greatest(r.max_players, 1))
      * coalesce(r.duration_hours, 1)
      * greatest(p_slots, 1)
      * (100 - coalesce(r.flash_deal_discount_percent, 0)) / 100.0
    )::integer,
    (public.booking_convenience_fee_cents(1) * greatest(p_slots, 1))::integer,
    (round(
       (r.base_price_cents::numeric / greatest(r.max_players, 1))
       * coalesce(r.duration_hours, 1)
       * greatest(p_slots, 1)
       * (100 - coalesce(r.flash_deal_discount_percent, 0)) / 100.0
     ) + public.booking_convenience_fee_cents(1) * greatest(p_slots, 1))::integer
  from public.reservations r
  where r.id = p_reservation_id;
$fn$;

comment on column public.courts.hourly_rate_cents is
  'Price for the whole court for one hour, as shown on the facility profile. A player pays this divided by the number of slots in the game, times the slots and hours they take.';
