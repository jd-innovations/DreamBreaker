-- The previous revision disabled the guard completely.
--
-- 20260901130000 checked `current_user in ('service_role','postgres',
-- 'supabase_admin')` to let the Stripe webhook through — but the function is
-- SECURITY DEFINER, and inside a definer function current_user is the
-- function's OWNER (postgres). So the check was true for every caller, and an
-- ordinary facility owner could edit verified, owner_user_id, payouts_ready
-- and claim_status at will.
--
-- Caught by a test that asserted an owner CANNOT flip payouts_ready. Reasoning
-- alone would not have found it: the code reads correctly, and the previous
-- migration's own comment argued for it confidently.
--
-- session_user is no good either — PostgREST connects as `authenticator` and
-- does SET LOCAL ROLE, so session_user is identical for anon, authenticated
-- and service_role.
--
-- The fix is to stop being SECURITY DEFINER. This function reads no tables; it
-- compares NEW to OLD and calls is_admin(), which is itself SECURITY DEFINER
-- and works fine when called from an invoker-rights trigger. As INVOKER,
-- current_user is the real effective role again.
create or replace function public.facilities_guard_privileged_columns()
returns trigger
language plpgsql
security invoker
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
