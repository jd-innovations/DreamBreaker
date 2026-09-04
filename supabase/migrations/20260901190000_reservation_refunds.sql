-- Facility Marketplace Phase 8 — cancellation refunds for bookings.
--
-- cancel_reservation() sets status and cancelled_at and stops. There are
-- succeeded reservation_payment rows in production, so a player who paid and
-- cancelled today got nothing back and NO RECORD was created that they were
-- owed anything. That is a live gap, not a future feature.
--
-- Nothing new is invented here. The `refunds` table is already generic —
-- payment_id is NOT NULL and registration_id is nullable — so a booking refund
-- anchors on the payment, and the reservation is reachable through
-- payments.purpose_id ('reservation_payment' -> reservation id). This is the
-- reservation twin of compute_registration_refund().
--
-- ── The window ──────────────────────────────────────────────────────────────
--
-- Decision on this build: a facility is paid for no-shows and for cancellations
-- made too late. So the player is refunded only when they cancel BEFORE the
-- window closes:
--
--     refundable  <=>  now() <= slot_start - cancellation_window_hours
--
-- which is the exact complement of the payable condition already encoded in
-- v_facility_payable_reservations. The two must stay complements: if both were
-- true the platform would refund a player and pay the facility for the same
-- booking, out of one payment.

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
begin
  select r.id, r.status, r.facility_id, lower(r.time_range) as slot_start,
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

  -- The payment for this booking. purpose_type/purpose_id is the generic link;
  -- reservations carries no payment id of its own.
  select p.id, p.amount_cents, p.refunded_amount_cents, p.status
    into v_payment
    from public.payments p
   where p.purpose_type = 'reservation_payment'
     and p.purpose_id = p_reservation_id
     and p.status in ('succeeded', 'refunded', 'partially_refunded')
   order by p.created_at desc
   limit 1;

  if v_payment.id is null then
    -- A free or unpaid booking cancels fine; there is simply nothing to return.
    return query select false, 0, null::uuid, v_res.cancellation_window_hours, v_hours, 'no_settled_payment';
    return;
  end if;

  if v_payment.refunded_amount_cents >= v_payment.amount_cents then
    return query select false, 0, v_payment.id, v_res.cancellation_window_hours, v_hours, 'already_refunded';
    return;
  end if;

  -- Too late. The court was held and nobody else could book it, so the
  -- facility is paid and the player is not refunded.
  if v_hours < v_res.cancellation_window_hours then
    return query select false, 0, v_payment.id, v_res.cancellation_window_hours, v_hours, 'inside_cancellation_window';
    return;
  end if;

  return query select true,
                      (v_payment.amount_cents - v_payment.refunded_amount_cents),
                      v_payment.id,
                      v_res.cancellation_window_hours,
                      v_hours,
                      null::text;
end;
$fn$;

revoke all on function public.compute_reservation_refund(uuid) from public;
-- Readable by the player, so the cancel screen can say what they will get back
-- BEFORE they confirm. The function derives the figure from what was actually
-- paid; it never accepts one.
grant execute on function public.compute_reservation_refund(uuid) to authenticated;

comment on function public.compute_reservation_refund(uuid) is
  'What a booking cancellation owes the player. Refundable only outside the facility cancellation window - the exact complement of v_facility_payable_reservations, so one payment is never both refunded and paid out.';
