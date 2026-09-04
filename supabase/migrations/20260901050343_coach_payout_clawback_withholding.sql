-- Phase 7: an unrecovered clawback now withholds from future payouts.
--
-- Until now a shortfall was recorded and then ignored: a coach who had already
-- withdrawn before a refund kept the money, and the platform's only recourse
-- was noticing the column. Withholding turns it into a debt that settles
-- itself out of the next lessons they deliver.

alter table public.coach_refunds
  add column if not exists clawback_recovered_cents integer not null default 0;

alter table public.coach_payout_batches
  add column if not exists withheld_cents integer not null default 0;

-- A fully withheld run is a real event worth recording — the redemptions were
-- earned and consumed by the debt — so a zero-value batch must be storable.
alter table public.coach_payout_batches
  drop constraint if exists coach_payout_batches_amount_cents_check;
alter table public.coach_payout_batches
  add constraint coach_payout_batches_amount_cents_check check (amount_cents >= 0);

-- What a coach still owes: shortfalls not yet recovered by withholding.
create or replace function public.coach_outstanding_clawback_cents(p_coach_id uuid)
returns integer
language sql
stable
as $fn$
  select coalesce(sum(greatest(r.clawback_shortfall_cents - r.clawback_recovered_cents, 0)), 0)::integer
    from public.coach_refunds r
    join public.coach_offer_purchases p on p.id = r.purchase_id
   where p.coach_id = p_coach_id
     and r.status = 'completed';
$fn$;

create or replace function public.claim_coach_payout_batch(p_coach_id uuid)
returns table (batch_id uuid, amount_cents integer, stripe_account_id text)
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_batch      uuid;
  v_gross      integer;
  v_account    text;
  v_owed       integer;
  v_withheld   integer;
  v_net        integer;
  v_remaining  integer;
  r            record;
begin
  select stripe_connect_account_id into v_account
    from public.profiles where id = p_coach_id;

  if v_account is null then
    return;
  end if;

  select coalesce(sum(v.amount_cents), 0) into v_gross
    from public.v_coach_payable_redemptions v
   where v.coach_id = p_coach_id and v.amount_cents > 0;

  if v_gross <= 0 then
    return;
  end if;

  v_owed     := public.coach_outstanding_clawback_cents(p_coach_id);
  v_withheld := least(v_gross, v_owed);
  v_net      := v_gross - v_withheld;

  insert into public.coach_payout_batches (coach_id, amount_cents, withheld_cents, stripe_account_id)
  values (p_coach_id, v_net, v_withheld, v_account)
  returning id into v_batch;

  insert into public.coach_payout_items (batch_id, redemption_id, purchase_id, amount_cents)
  select v_batch, v.redemption_id, v.purchase_id, v.amount_cents
    from public.v_coach_payable_redemptions v
   where v.coach_id = p_coach_id and v.amount_cents > 0;

  -- Apply the withholding against the oldest debts first, so a coach's account
  -- clears in the order the refunds happened rather than arbitrarily.
  v_remaining := v_withheld;
  for r in
    select cr.id, greatest(cr.clawback_shortfall_cents - cr.clawback_recovered_cents, 0) as owed
      from public.coach_refunds cr
      join public.coach_offer_purchases p on p.id = cr.purchase_id
     where p.coach_id = p_coach_id
       and cr.status = 'completed'
       and cr.clawback_shortfall_cents > cr.clawback_recovered_cents
     order by cr.completed_at asc
  loop
    exit when v_remaining <= 0;
    update public.coach_refunds
       set clawback_recovered_cents = clawback_recovered_cents + least(v_remaining, r.owed)
     where id = r.id;
    v_remaining := v_remaining - least(v_remaining, r.owed);
  end loop;

  batch_id          := v_batch;
  amount_cents      := v_net;
  stripe_account_id := v_account;
  return next;
end;
$fn$;

revoke all on function public.claim_coach_payout_batch(uuid) from public;
grant execute on function public.claim_coach_payout_batch(uuid) to service_role;

comment on function public.coach_outstanding_clawback_cents(uuid) is
  'Refund clawbacks that could not be reversed from the coach and have not yet been recovered by withholding.';
