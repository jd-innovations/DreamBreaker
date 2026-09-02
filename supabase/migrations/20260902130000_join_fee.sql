-- Joiners pay their own convenience fee.
--
-- The organizer pays $2 for themselves at booking. Everyone who joins pays
-- their own $2 when they join.
--
-- join_reservation() was free and instant: it inserted a row and returned. A
-- fee cannot simply be bolted on, because payment happens outside the database
-- — two people could pay for the last seat and one would need refunding. So a
-- seat is HELD while its fee is paid, mirroring exactly what reservations
-- already do with held -> confirmed and hold_expires_at.

alter table public.reservation_players
  add column if not exists status text not null default 'confirmed'
    check (status in ('held', 'confirmed')),
  add column if not exists hold_expires_at timestamptz,
  add column if not exists service_fee_cents integer not null default 0
    check (service_fee_cents >= 0),
  add column if not exists payment_id uuid references public.payments(id) on delete set null;

-- Existing rows are already-seated players; the default above keeps them
-- confirmed rather than sweeping them out from under live bookings.

create index if not exists reservation_players_hold_idx
  on public.reservation_players (status, hold_expires_at)
  where status = 'held';

-- ── Joining now reserves a seat rather than taking one ──────────────────────
--
-- The organizer is inserted directly by create_reservation and stays
-- 'confirmed' with a zero fee — they already paid theirs as part of the
-- booking.
create or replace function public.join_reservation(p_reservation_id uuid)
returns public.reservation_players
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_res reservations;
  v_count integer;
  v_row reservation_players;
  v_user uuid := auth.uid();
  v_fee integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_res from reservations where id = p_reservation_id for update;

  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;

  if v_res.status not in ('held', 'confirmed') then
    raise exception 'reservation_not_joinable' using errcode = 'P0003';
  end if;

  if v_res.status = 'held' and v_res.hold_expires_at < now() then
    raise exception 'hold_expired' using errcode = 'P0004';
  end if;

  -- Held seats count. Without this the last seat oversells to everyone who
  -- reaches the payment screen at the same moment.
  select count(*) into v_count
    from reservation_players
   where reservation_id = p_reservation_id
     and (status = 'confirmed'
          or (status = 'held' and coalesce(hold_expires_at, now()) > now()));

  if v_count >= v_res.max_players then
    raise exception 'reservation_full' using errcode = 'P0005';
  end if;

  -- A previous abandoned hold should not block a genuine retry.
  delete from reservation_players
   where reservation_id = p_reservation_id
     and profile_id = v_user
     and status = 'held'
     and coalesce(hold_expires_at, now()) <= now();

  if exists (select 1 from reservation_players
              where reservation_id = p_reservation_id and profile_id = v_user) then
    raise exception 'already_joined' using errcode = 'P0006';
  end if;

  v_fee := public.booking_convenience_fee_cents(1);

  insert into reservation_players (
    reservation_id, profile_id, is_organizer, status, hold_expires_at, service_fee_cents
  )
  values (
    p_reservation_id, v_user, false,
    -- A free court charges no fee, so there is nothing to pay and nothing to
    -- hold: seat the player immediately.
    case when v_fee > 0 then 'held' else 'confirmed' end,
    case when v_fee > 0 then now() + interval '10 minutes' else null end,
    v_fee
  )
  returning * into v_row;

  return v_row;
end;
$fn$;

-- ── Confirming a seat once its fee is paid ──────────────────────────────────
create or replace function public.confirm_reservation_player(
  p_reservation_id uuid,
  p_payment_id uuid default null
)
returns public.reservation_players
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_row reservation_players;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  update reservation_players
     set status = 'confirmed',
         hold_expires_at = null,
         payment_id = coalesce(p_payment_id, payment_id)
   where reservation_id = p_reservation_id
     and profile_id = v_user
   returning * into v_row;

  if not found then
    raise exception 'player_row_not_found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$fn$;

-- ── Occupancy counts held seats ─────────────────────────────────────────────
-- A seat being paid for is taken. Reporting it free is what lets the roster
-- oversell between two people checking out at once.
create or replace function public.reservation_occupancy(p_reservation_id uuid)
returns table (current_players integer, max_players integer, pending_invites integer, status reservation_status)
language sql
stable
security definer
set search_path = public
as $fn$
  SELECT
    (SELECT count(*)::int FROM reservation_players
      WHERE reservation_id = p_reservation_id
        AND (status = 'confirmed'
             OR (status = 'held' AND coalesce(hold_expires_at, now()) > now()))),
    r.max_players,
    (SELECT count(*)::int FROM reservation_invites WHERE reservation_id = p_reservation_id AND status = 'pending'),
    r.status
  FROM reservations r WHERE r.id = p_reservation_id;
$fn$;

-- ── Sweeping abandoned seats ────────────────────────────────────────────────
-- Extends the existing hold sweeper, which the expire-reservation-holds cron
-- already runs every 5 minutes. Same protection as reservations: never expire
-- a seat with a live payment attempt against it, or a captured charge becomes
-- an unreconciled one.
create or replace function public.expire_stale_reservation_holds()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $fn$
DECLARE
  expired_count integer;
BEGIN
  UPDATE reservations r
     SET status = 'expired',
         updated_at = now()
   WHERE r.status = 'held'
     AND r.hold_expires_at IS NOT NULL
     AND r.hold_expires_at < now()
     AND NOT EXISTS (
       SELECT 1
         FROM payments p
        WHERE p.purpose_type = 'reservation_payment'
          AND p.purpose_id   = r.id
          AND p.status IN ('requires_confirmation', 'processing')
          AND p.created_at > now() - interval '15 minutes'
     );

  GET DIAGNOSTICS expired_count = ROW_COUNT;

  DELETE FROM reservation_players rp
   WHERE rp.status = 'held'
     AND rp.hold_expires_at IS NOT NULL
     AND rp.hold_expires_at < now()
     AND NOT EXISTS (
       SELECT 1
         FROM payments p
        WHERE p.purpose_type = 'reservation_join_fee'
          AND p.purpose_id   = rp.reservation_id
          AND p.payer_user_id = rp.profile_id
          AND p.status IN ('requires_confirmation', 'processing')
          AND p.created_at > now() - interval '15 minutes'
     );

  RETURN expired_count;
END;
$fn$;

grant execute on function public.confirm_reservation_player(uuid, uuid) to authenticated;

comment on column public.reservation_players.status is
  'held while the joiner pays their convenience fee, confirmed once paid. Held seats count toward capacity — otherwise the last seat oversells to everyone checking out at the same moment.';
