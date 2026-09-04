-- Facility Marketplace Phase 5 — check-in.
--
-- A front desk confirming that the person in front of them holds a valid
-- booking. Same scanner shape as coach voucher redemption, and deliberately
-- NOT the same meaning.
--
-- ── Why this touches no money ───────────────────────────────────────────────
--
-- For a coach, the scan IS the payout trigger: redeem_coach_voucher is what
-- makes the purchase payable, because the redemption is the only proof the
-- lesson happened.
--
-- Copying that here would contradict the decision that a facility is paid for
-- no-shows: a no-show never scans, so the venue would never be paid for a court
-- it held and nobody else could book. It would also hand every facility a lever
-- to withhold its own revenue by simply not scanning.
--
-- So payout eligibility stays on the slot elapsing
-- (v_facility_payable_reservations, Phase 4) and this records attendance only.
-- Same UX, different meaning.

create or replace function public.generate_check_in_code()
returns text
language plpgsql
volatile
as $$
declare
  -- Same alphabet as voucher codes: no I, L, O, 0 or 1. It gets read aloud
  -- across a desk by someone holding a paddle.
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := '';
    for _ in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    select exists(select 1 from public.reservations where check_in_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

alter table public.reservations
  add column if not exists check_in_code text;

update public.reservations
   set check_in_code = public.generate_check_in_code()
 where check_in_code is null;

alter table public.reservations
  alter column check_in_code set default public.generate_check_in_code();

create unique index if not exists reservations_check_in_code_key
  on public.reservations (check_in_code);

-- Append-only, like coach_voucher_redemptions. A check-in is a thing that
-- happened; editing history is not a feature.
create table if not exists public.reservation_check_ins (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  facility_id    uuid not null references public.facilities(id) on delete cascade,
  checked_in_by  uuid references public.profiles(id) on delete set null,
  method         text not null check (method in ('qr', 'manual')),
  checked_in_at  timestamptz not null default now()
);

-- One check-in per reservation. A second scan is a no-op, not a duplicate row.
create unique index if not exists reservation_check_ins_reservation_key
  on public.reservation_check_ins (reservation_id);

alter table public.reservation_check_ins enable row level security;

drop policy if exists "reservation check-ins: staff and player read" on public.reservation_check_ins;
create policy "reservation check-ins: staff and player read"
  on public.reservation_check_ins for select
  using (
    public.is_facility_role_at_least(facility_id, (select auth.uid()), 'staff'::facility_member_role)
    or public.is_reservation_player(reservation_id, (select auth.uid()))
    or public.is_admin()
  );

-- No INSERT policy: writes go through check_in_reservation, which is where the
-- staff check and the timing window live.

create or replace function public.check_in_reservation(
  p_code text,
  p_method text default 'qr'
)
returns table (
  reservation_id uuid,
  facility_name text,
  asset_name text,
  player_name text,
  slot_start timestamptz,
  already_checked_in boolean
)
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_res   public.reservations%rowtype;
  v_existing public.reservation_check_ins%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_method not in ('qr', 'manual') then raise exception 'invalid_method'; end if;

  select * into v_res from public.reservations
   where upper(trim(check_in_code)) = upper(trim(p_code));

  if not found then raise exception 'reservation_not_found'; end if;

  -- Staff, not manager: checking someone in is front-desk work. The facility
  -- is resolved from the RESERVATION, so a code from another venue cannot be
  -- checked in here even by real staff.
  if not public.is_facility_role_at_least(v_res.facility_id, v_actor, 'staff'::facility_member_role) then
    raise exception 'not_facility_staff';
  end if;

  if v_res.status <> 'confirmed' then
    raise exception 'reservation_not_confirmed';
  end if;

  -- A booking is checked in around its slot, not a week early. Generous at the
  -- front — people arrive to warm up — and open until the slot ends, because a
  -- late arrival is still an arrival.
  if now() < lower(v_res.time_range) - interval '2 hours' then
    raise exception 'too_early';
  end if;
  if now() > upper(v_res.time_range) then
    raise exception 'slot_ended';
  end if;

  select * into v_existing from public.reservation_check_ins
   where reservation_check_ins.reservation_id = v_res.id;

  if not found then
    insert into public.reservation_check_ins (reservation_id, facility_id, checked_in_by, method)
    values (v_res.id, v_res.facility_id, v_actor, p_method);
    already_checked_in := false;
  else
    -- Idempotent on purpose: a second scan should tell the desk "already in",
    -- not fail with a constraint error.
    already_checked_in := true;
  end if;

  reservation_id := v_res.id;
  facility_name  := (select name from public.facilities where id = v_res.facility_id);
  asset_name     := case v_res.asset_type
                      when 'court' then (select name from public.courts where id = v_res.asset_id)
                      when 'ball_machine' then (select name from public.ball_machines where id = v_res.asset_id)
                    end;
  player_name    := (select full_name from public.profiles where id = v_res.organizer_id);
  slot_start     := lower(v_res.time_range);
  return next;
end;
$fn$;

revoke all on function public.check_in_reservation(text, text) from public;
grant execute on function public.check_in_reservation(text, text) to authenticated;

comment on table public.reservation_check_ins is
  'Attendance, not payment. Deliberately decoupled from payout: a facility is paid when the slot elapses (see v_facility_payable_reservations), so a no-show still pays and no venue can withhold its own revenue by not scanning.';
