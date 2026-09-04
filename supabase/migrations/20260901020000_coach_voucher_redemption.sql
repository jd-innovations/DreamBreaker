-- Coach Marketplace Phase 5 — voucher redemption.
--
-- Until now a purchased lesson produced an entitlement nobody could consume:
-- coach_voucher_entitlements sat at status 'active' with no way to spend it,
-- so a buyer turned up for a lesson and the coach had nothing to check.
--
-- Redemption is coach-side by design. The buyer presents a code; the coach —
-- authenticated as the owner of the offer — is the actor who consumes it. A
-- buyer must never be able to redeem their own voucher, or the count means
-- nothing.

-- ── The code the buyer shows ────────────────────────────────────────────────
--
-- One value serves both paths: encoded into the QR (as the /q/<token> shape
-- qrPayload.ts already reserves) and typed by hand when a camera will not
-- cooperate — indoors, cracked screen, dead battery on the buyer's phone.
-- Two separate secrets would be two things to explain and two to keep in sync.
--
-- Alphabet excludes I, L, O, 0 and 1: this gets read aloud across a court and
-- typed by someone holding a paddle.
create or replace function public.generate_voucher_redemption_code()
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := '';
    for _ in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    select exists(select 1 from public.coach_voucher_entitlements where redemption_code = v_code)
      into v_exists;

    exit when not v_exists;
  end loop;

  return v_code;
end;
$$;

alter table public.coach_voucher_entitlements
  add column if not exists redemption_code text;

-- Backfill before the NOT NULL / UNIQUE constraints: one entitlement already
-- exists in production from the first real purchase.
update public.coach_voucher_entitlements
   set redemption_code = public.generate_voucher_redemption_code()
 where redemption_code is null;

alter table public.coach_voucher_entitlements
  alter column redemption_code set not null;

create unique index if not exists coach_voucher_entitlements_redemption_code_key
  on public.coach_voucher_entitlements (redemption_code);

-- ── The redemption log ──────────────────────────────────────────────────────
--
-- Append-only, like coach_offer_purchase_ledger_events. A redemption is the
-- moment a paid-for thing is consumed; if it is ever disputed ("I never got my
-- lesson"), the row that says who scanned what and when is the only evidence
-- either side has.
create table if not exists public.coach_voucher_redemptions (
  id                uuid primary key default gen_random_uuid(),
  entitlement_id    uuid not null references public.coach_voucher_entitlements(id) on delete restrict,
  purchase_id       uuid not null references public.coach_offer_purchases(id) on delete restrict,
  offer_id          uuid not null references public.coach_offers(id) on delete restrict,
  buyer_id          uuid not null references public.profiles(id) on delete restrict,
  -- Who performed it. Always the coach; recorded rather than assumed so an
  -- admin-assisted redemption later is distinguishable.
  redeemed_by       uuid not null references public.profiles(id) on delete restrict,
  method            text not null check (method in ('qr', 'manual')),
  -- What was left afterwards, captured at the time: a package voucher's
  -- remaining count changes, and reconstructing it later from the current
  -- value would be wrong.
  remaining_after   integer not null,
  redeemed_at       timestamptz not null default now()
);

create index if not exists coach_voucher_redemptions_entitlement_idx
  on public.coach_voucher_redemptions (entitlement_id, redeemed_at desc);
create index if not exists coach_voucher_redemptions_coach_idx
  on public.coach_voucher_redemptions (redeemed_by, redeemed_at desc);

alter table public.coach_voucher_redemptions enable row level security;

-- Both sides of the transaction can see it; nobody can write it directly —
-- the RPC below is the only path in.
drop policy if exists "coach_voucher_redemptions: participants read" on public.coach_voucher_redemptions;
create policy "coach_voucher_redemptions: participants read"
  on public.coach_voucher_redemptions for select
  using (buyer_id = (select auth.uid()) or redeemed_by = (select auth.uid()) or public.is_admin());

create or replace function public.fn_block_voucher_redemption_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'coach_voucher_redemptions is append-only';
end;
$$;

drop trigger if exists trg_block_voucher_redemption_mutation on public.coach_voucher_redemptions;
create trigger trg_block_voucher_redemption_mutation
  before update or delete on public.coach_voucher_redemptions
  for each row execute function public.fn_block_voucher_redemption_mutation();

-- ── The redemption itself ───────────────────────────────────────────────────
--
-- SECURITY DEFINER because the caller is the coach, who has no RLS route to
-- another person's wallet entitlement — and should not be given one. Every
-- check is server-side; the client sends a code and nothing else.
create or replace function public.redeem_coach_voucher(
  p_code text,
  p_method text default 'qr'
)
returns table (
  entitlement_id     uuid,
  offer_title        text,
  buyer_name         text,
  remaining_after    integer,
  total_redemptions  integer,
  fully_redeemed     boolean
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_ent   public.coach_voucher_entitlements%rowtype;
  v_title text;
  v_buyer text;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  if p_method not in ('qr', 'manual') then
    raise exception 'invalid_method';
  end if;

  -- FOR UPDATE: two coaches scanning the same code at once, or a double tap,
  -- must not both decrement. The lock is what makes the remaining count true.
  select * into v_ent
    from public.coach_voucher_entitlements
   where upper(trim(redemption_code)) = upper(trim(p_code))
   for update;

  if not found then
    raise exception 'voucher_not_found';
  end if;

  -- Authorization before state: only the coach who sold it may consume it.
  -- Notably NOT the buyer — a buyer who could redeem their own voucher makes
  -- the whole count meaningless.
  if v_ent.coach_id <> v_actor then
    raise exception 'not_your_voucher';
  end if;

  if v_ent.status = 'revoked' or v_ent.revoked_at is not null then
    raise exception 'voucher_revoked';
  end if;

  if v_ent.expires_at < now() then
    raise exception 'voucher_expired';
  end if;

  if v_ent.remaining_redemptions <= 0 then
    raise exception 'voucher_already_redeemed';
  end if;

  update public.coach_voucher_entitlements
     set remaining_redemptions = remaining_redemptions - 1,
         exhausted_at = case when remaining_redemptions - 1 = 0 then now() else exhausted_at end,
         status = case when remaining_redemptions - 1 = 0 then 'exhausted' else status end,
         updated_at = now()
   where id = v_ent.id
  returning remaining_redemptions into remaining_after;

  insert into public.coach_voucher_redemptions
    (entitlement_id, purchase_id, offer_id, buyer_id, redeemed_by, method, remaining_after)
  values
    (v_ent.id, v_ent.purchase_id, v_ent.offer_id, v_ent.buyer_id, v_actor, p_method, remaining_after);

  select o.title into v_title from public.coach_offers o where o.id = v_ent.offer_id;
  select p.full_name into v_buyer from public.profiles p where p.id = v_ent.buyer_id;

  entitlement_id    := v_ent.id;
  offer_title       := coalesce(v_title, 'Lesson');
  buyer_name        := coalesce(v_buyer, 'Player');
  total_redemptions := v_ent.total_redemptions;
  fully_redeemed    := remaining_after = 0;
  return next;
end;
$$;

revoke all on function public.redeem_coach_voucher(text, text) from public;
grant execute on function public.redeem_coach_voucher(text, text) to authenticated;

grant select (redemption_code) on public.coach_voucher_entitlements to authenticated;

comment on function public.redeem_coach_voucher(text, text) is
  'Phase 5: consumes one redemption from a coach voucher. Coach-only (auth.uid() must equal the entitlement coach_id), row-locked, and logged append-only to coach_voucher_redemptions.';
