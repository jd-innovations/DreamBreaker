-- Stripe live cutover (2026-10-06): forget the test-mode Connect accounts.
--
-- Test-mode connected accounts do not exist in live mode. Both onboarding
-- paths REUSE a stored account id (web connect/start and the
-- create-connect-onboarding-link edge function), so with live keys "Set up
-- payouts" would call Stripe with an acct_ id that live mode has never seen
-- and fail. Clearing the ids makes the next onboarding create a live account;
-- the account.updated webhook then sets everything back as Stripe confirms.
--
-- At cutover there is exactly one of each, both the owner's:
--   profile   8eb9b4cf (coach 'active', director approved, onboarded)
--   facility  Lakewood Ranch Athletic Club (payouts_ready)
-- No Stripe customers, saved cards or open payout batches exist.
--
-- After this the owner's coach status is 'onboarding'. Lesson purchases from
-- that coach are refused for non-admins (20261005120000) until live
-- onboarding completes, and the webhook moves onboarding -> active. Facility
-- bookings that need payouts_ready wait for live onboarding too.
--
-- Reversible: old values are kept in private.stripe_test_connect_backup.

begin;

create table if not exists private.stripe_test_connect_backup (
  entity      text not null,
  row_id      uuid not null,
  old_values  jsonb not null,
  reset_at    timestamptz not null default now(),
  primary key (entity, row_id)
);

insert into private.stripe_test_connect_backup (entity, row_id, old_values)
select 'profile', id, jsonb_build_object(
         'stripe_connect_account_id', stripe_connect_account_id,
         'stripe_connect_onboarded_at', stripe_connect_onboarded_at,
         'coach_status', coach_status)
  from public.profiles
 where stripe_connect_account_id is not null
on conflict do nothing;

insert into private.stripe_test_connect_backup (entity, row_id, old_values)
select 'facility_payout_account', a.facility_id, to_jsonb(a) || jsonb_build_object('payouts_ready', f.payouts_ready)
  from public.facility_payout_accounts a
  join public.facilities f on f.id = a.facility_id
on conflict do nothing;

-- fn_protect_coach_status_transitions only lets the service role move a coach
-- out of 'active'; this is the platform acting, as the webhook would.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

update public.profiles
   set coach_status = case when is_coach and coach_status in ('active', 'restricted')
                           then 'onboarding'::public.coach_status else coach_status end,
       stripe_connect_account_id = null,
       stripe_connect_onboarded_at = null
 where stripe_connect_account_id is not null;

update public.facilities f
   set payouts_ready = false
  from public.facility_payout_accounts a
 where a.facility_id = f.id and f.payouts_ready;

-- Deleted, not nulled: the edge function INSERTs a fresh row when none exists.
delete from public.facility_payout_accounts;

commit;

-- ─── UNDO (test keys only — these ids are meaningless under live keys) ──────
-- update public.profiles p set
--     stripe_connect_account_id   = b.old_values->>'stripe_connect_account_id',
--     stripe_connect_onboarded_at = (b.old_values->>'stripe_connect_onboarded_at')::timestamptz,
--     coach_status                = (b.old_values->>'coach_status')::public.coach_status
--   from private.stripe_test_connect_backup b where b.entity = 'profile' and b.row_id = p.id;
-- insert into public.facility_payout_accounts (facility_id, stripe_connect_account_id, onboarded_at, created_by, created_at, updated_at)
-- select row_id, old_values->>'stripe_connect_account_id', (old_values->>'onboarded_at')::timestamptz,
--        (old_values->>'created_by')::uuid, (old_values->>'created_at')::timestamptz, (old_values->>'updated_at')::timestamptz
--   from private.stripe_test_connect_backup where entity = 'facility_payout_account';
