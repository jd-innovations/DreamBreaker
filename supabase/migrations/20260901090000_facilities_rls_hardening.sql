-- facilities RLS hardening — two live bugs, found 2026-09-01.
--
-- ── Bug 1: the immutability guards never worked ─────────────────────────────
--
-- "facilities: authenticated claim" and "facilities: owner update" both tried
-- to pin a column to its current value with:
--
--     verified = (select facilities_1.verified
--                   from facilities facilities_1
--                  where facilities_1.id = facilities_1.id)
--
-- `facilities_1.id = facilities_1.id` is a tautology — it correlates the alias
-- to ITSELF instead of to the outer row. The subquery therefore returns all 194
-- rows, and a scalar subquery cannot. Every update through either policy fails
-- with "more than one row returned by a subquery used as an expression".
--
-- Confirmed against production by attempting the claim update as an ordinary
-- user. This is why all 194 facilities are still 'unclaimed' and 0 have an
-- owner: the claim path was never capable of running.
--
-- The fix is not a corrected subquery. Postgres RLS cannot see OLD in a
-- WITH CHECK clause, so column immutability is not expressible there at all —
-- it belongs in a trigger, which is where it goes below.
--
-- ── Bug 2: any authenticated user could mint a verified, self-owned venue ────
--
-- "facilities: authenticated insert" checked only `auth.uid() IS NOT NULL`,
-- constraining no columns. Confirmed against production: an ordinary user can
-- insert a facility with verified = true, claim_status = 'claimed',
-- owner_user_id = themselves and status = 'approved'. With "facilities: public
-- read" being `using (true)`, it appears in the directory immediately.
--
-- lib/supabase/facilities.ts forces verified/claim_status on the way in, but
-- that is client-side politeness; anyone holding the anon key can post directly
-- to PostgREST. It matters more than it looks: under the facility marketplace
-- plan an OWNED facility is what gates Stripe Connect onboarding and payouts,
-- so a forged owner row is the first step to a forged payout destination.
--
-- Scope note: directory VISIBILITY is deliberately not touched here. "public
-- read using (true)" shows pending rows, which is a Phase 1 design question,
-- not a security fix, and narrowing it now could hide facilities the app is
-- currently listing.

-- ─────────────────────────────────────────────────────────────────────────────
-- Privileged columns, enforced where it actually works: a trigger.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.facilities_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Admins are trusted; this is the path approvals will run through.
  if public.is_admin() then
    return new;
  end if;

  -- Trust markers a user must never set for themselves.
  if new.verified is distinct from old.verified then
    raise exception 'facilities: verified is not user-editable';
  end if;

  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'facilities: owner_user_id is set by approval, not by update';
  end if;

  -- The one transition a user may drive: asking to be considered.
  -- Anything else (pending -> claimed, claimed -> unclaimed) is an admin action.
  if new.claim_status is distinct from old.claim_status
     and not (old.claim_status = 'unclaimed' and new.claim_status = 'pending') then
    raise exception 'facilities: claim_status transition % -> % requires an admin',
      old.claim_status, new.claim_status;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_facilities_guard_privileged on public.facilities;
create trigger trg_facilities_guard_privileged
  before update on public.facilities
  for each row execute function public.facilities_guard_privileged_columns();

-- ─────────────────────────────────────────────────────────────────────────────
-- Insert: a suggestion, and nothing more.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "facilities: authenticated insert" on public.facilities;
create policy "facilities: authenticated suggest" on public.facilities for insert
  to authenticated
  with check (
    verified = false
    and claim_status = 'unclaimed'
    and owner_user_id is null
    -- Attributable. Without this a suggestion has no author to review.
    and created_by = (select auth.uid())
    -- Provenance cannot be forged as an import: 'google_places' rows carry more
    -- implicit trust than a stranger's typing.
    and data_source is distinct from 'google_places'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Update policies, now that the trigger owns immutability.
-- ─────────────────────────────────────────────────────────────────────────────

-- Superseded by the facility-manager application flow (see
-- FACILITY_MARKETPLACE_PLAN.md Phase 1), but repaired rather than removed:
-- leaving a broken policy in place hides the fact that nothing works.
drop policy if exists "facilities: authenticated claim" on public.facilities;
create policy "facilities: authenticated claim" on public.facilities for update
  to authenticated
  using (claim_status = 'unclaimed')
  with check (true);

drop policy if exists "facilities: owner update" on public.facilities;
create policy "facilities: owner update" on public.facilities for update
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

comment on function public.facilities_guard_privileged_columns() is
  'Immutability guard for verified / owner_user_id / claim_status. Lives in a trigger because RLS WITH CHECK cannot reference OLD — the previous subquery attempt was a tautology that made every update error.';
