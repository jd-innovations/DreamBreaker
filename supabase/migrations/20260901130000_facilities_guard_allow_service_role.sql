-- The guard blocked the very writer it exists to permit.
--
-- payouts_ready is set by the Stripe account.updated webhook, which runs with
-- the service-role key and therefore has no auth.uid() — so public.is_admin()
-- is false and the trigger raised. Same for any future service-role writer.
--
-- current_user is the reliable signal: PostgREST does SET LOCAL ROLE
-- service_role for a service-key request, and direct SQL runs as postgres.
-- Checking the role rather than the JWT also survives a call with no JWT at all.
--
-- ⚠️ This revision is WRONG and is superseded by the next migration. It is kept
-- rather than edited so the mistake stays legible: the function is SECURITY
-- DEFINER, and inside a definer function current_user is the function's OWNER,
-- so this check passes for every caller and disables the guard entirely. See
-- 20260901140000_facilities_guard_fix_security_definer.sql.
create or replace function public.facilities_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_admin() then
    return new;
  end if;

  if new.verified is distinct from old.verified then
    raise exception 'facilities: verified is not user-editable';
  end if;

  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'facilities: owner_user_id is set by approval, not by update';
  end if;

  if new.payouts_ready is distinct from old.payouts_ready then
    raise exception 'facilities: payouts_ready reflects Stripe, not user input';
  end if;

  if new.claim_status is distinct from old.claim_status
     and not (old.claim_status = 'unclaimed' and new.claim_status = 'pending') then
    raise exception 'facilities: claim_status transition % -> % requires an admin',
      old.claim_status, new.claim_status;
  end if;

  return new;
end;
$fn$;
