-- Refunds follow the slots.
--
-- Under per-slot pricing each player paid their own share, so each is refunded
-- their own share. compute_reservation_refund assumed a single payer and looked
-- up ONE payment for the whole booking; a reservation now has as many payments
-- as it has payers.
--
-- The payment is found by PAYER, not by purpose: the organizer pays through
-- 'reservation_payment' and a joiner through 'reservation_join_fee', and both
-- are that person's money for the same booking.
--
-- The convenience fee is kept, per policy, so only the court share comes back.
-- compute_reservation_refund is left in place rather than dropped — it is
-- harmless, and removing a function other code may still reference is a
-- separate decision.
create or replace function public.compute_player_refund(
  p_reservation_id uuid,
  p_profile_id uuid default null
)
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
  v_who     uuid := coalesce(p_profile_id, auth.uid());
  v_res     record;
  v_seat    record;
  v_payment record;
  v_hours   numeric;
  v_refundable integer;
begin
  if v_who is null then
    return query select false, 0, null::uuid, 0, 0::numeric, 'not_authenticated';
    return;
  end if;

  select r.id, lower(r.time_range) as slot_start, f.cancellation_window_hours
    into v_res
    from public.reservations r
    join public.facilities f on f.id = r.facility_id
   where r.id = p_reservation_id;

  if not found then
    return query select false, 0, null::uuid, 0, 0::numeric, 'reservation_not_found';
    return;
  end if;

  v_hours := extract(epoch from (v_res.slot_start - now())) / 3600.0;

  select rp.court_share_cents, rp.service_fee_cents, rp.status
    into v_seat
    from public.reservation_players rp
   where rp.reservation_id = p_reservation_id and rp.profile_id = v_who;

  if not found then
    return query select false, 0, null::uuid, v_res.cancellation_window_hours, v_hours, 'not_a_player';
    return;
  end if;

  select p.id, p.amount_cents, p.refunded_amount_cents
    into v_payment
    from public.payments p
   where p.purpose_id = p_reservation_id
     and p.payer_user_id = v_who
     and p.purpose_type in ('reservation_payment', 'reservation_join_fee')
     and p.status in ('succeeded', 'refunded', 'partially_refunded')
   order by p.created_at desc
   limit 1;

  if v_payment.id is null then
    return query select false, 0, null::uuid, v_res.cancellation_window_hours, v_hours, 'no_settled_payment';
    return;
  end if;

  -- Court share only. The fee is kept.
  v_refundable := v_seat.court_share_cents - v_payment.refunded_amount_cents;

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

revoke all on function public.compute_player_refund(uuid, uuid) from public;
grant execute on function public.compute_player_refund(uuid, uuid) to authenticated, service_role;

-- Everyone still holding a paid slot, for an organizer cancelling the booking.
create or replace function public.reservation_paid_players(p_reservation_id uuid)
returns table (profile_id uuid, is_organizer boolean)
language sql
stable
security definer
set search_path = public
as $fn$
  select rp.profile_id, rp.is_organizer
    from public.reservation_players rp
   where rp.reservation_id = p_reservation_id
     and rp.status = 'confirmed'
   order by rp.is_organizer desc;
$fn$;

grant execute on function public.reservation_paid_players(uuid) to service_role;

-- A joiner giving up their slots. Deleting the row frees the slots, and the
-- totals trigger drops their share from what the facility is owed.
create or replace function public.release_reservation_slots(
  p_reservation_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  delete from public.reservation_players
   where reservation_id = p_reservation_id
     and profile_id = p_profile_id
     and is_organizer = false;
end;
$fn$;

grant execute on function public.release_reservation_slots(uuid, uuid) to service_role;

comment on function public.compute_player_refund(uuid, uuid) is
  'What cancelling owes ONE player: their court share, never the convenience fee, and only outside the facility window. Per-slot pricing means a booking has as many refunds as payers.';
