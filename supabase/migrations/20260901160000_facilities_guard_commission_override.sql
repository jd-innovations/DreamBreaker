-- commission_override_pct lives on `facilities`, and facility owners have an
-- UPDATE policy on that table. Without this a venue could set its own
-- commission to zero and keep the platform's share — the single most obvious
-- way to steal from this design.
--
-- cancellation_window_hours is deliberately NOT guarded: that is the facility's
-- own policy to set, and the CHECK caps it at a week.
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

  if new.commission_override_pct is distinct from old.commission_override_pct then
    raise exception 'facilities: commission_override_pct is set by the platform, not the facility';
  end if;

  if new.claim_status is distinct from old.claim_status
     and not (old.claim_status = 'unclaimed' and new.claim_status = 'pending') then
    raise exception 'facilities: claim_status transition % -> % requires an admin',
      old.claim_status, new.claim_status;
  end if;

  return new;
end;
$fn$;
