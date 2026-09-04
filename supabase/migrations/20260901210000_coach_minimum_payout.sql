-- A $100 minimum payout for coaches, matching the facility floor.
--
-- Separate from 20260901200000 because this changes a LIVE payout path with a
-- real connected account behind it, while the facility one had never run.
--
-- ── Applied to gross, before clawback withholding ───────────────────────────
--
-- claim_coach_payout_batch computes gross payable, withholds any outstanding
-- clawback, and transfers the remainder. The floor is checked against GROSS,
-- not the net.
--
-- Checking the net instead would be a quiet trap: a coach owing a large
-- clawback nets little or nothing every run, so a net-based floor would stop
-- the claim, and the withholding loop — the thing that actually clears the
-- debt — would never execute. The debt would become permanent, and the coach
-- would never be paid again.
--
-- Against gross, a run with enough earnings still claims, still recovers debt
-- oldest-first, and still settles a zero transfer through the existing
-- withheldOnly path in the runner. Only the "not worth a transfer yet" case is
-- deferred, which is the whole point of a floor.
--
-- Everything below is the existing function with the two v_minimum lines added;
-- nothing else changed.

insert into public.platform_settings (key, value, value_type, label, description, sort_order)
values
  ('coach_marketplace_minimum_payout_cents', '10000', 'number',
   'Coach Marketplace: Minimum Payout',
   'A coach is not paid until the amount owed reaches this. Balances accumulate until then.', 923)
on conflict (key) do nothing;

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
  v_minimum    integer;
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

  -- The floor. Nothing is claimed below it, so the redemptions stay payable and
  -- accumulate into a later run.
  v_minimum := coalesce(
    (select value::integer from public.platform_settings
      where key = 'coach_marketplace_minimum_payout_cents'), 10000);

  if v_gross < v_minimum then
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
