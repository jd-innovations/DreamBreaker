-- Close the two direct-write paths on public.facilities (2026-11-25).
--
-- Found while planning the public web directory. Both policies date from
-- 20260901090000_facilities_rls_hardening.sql:
--
-- 1. "facilities: authenticated claim" — FOR UPDATE, using (claim_status =
--    'unclaimed'), with check (true). Meant only to let a user flip
--    unclaimed -> pending, but RLS cannot limit WHICH columns change, so any
--    signed-in user could rewrite name, address, coordinates, phone, website,
--    description, slug, data_source... of every unclaimed facility (all 2,024
--    on this date). trg_facilities_guard_privileged only protects verified,
--    owner_user_id, payouts_ready, commission_override_pct and claim_status.
--
-- 2. "facilities: authenticated suggest" — FOR INSERT. Any signed-in user could
--    add a facility that "public read using (true)" lists to everyone at once,
--    with no review.
--
-- Neither has a caller: claiming moved to facility_manager_applications
-- (FACILITY_MARKETPLACE_PLAN.md Phase 1), and suggestFacility() was never wired
-- to a screen. Verified 2026-11-25: zero facilities have a user-written
-- data_source. User submissions will go through a review table instead
-- (new location / edit), applied only by an admin.
--
-- Untouched: "admin full access", "owner update" (claimed owners editing their
-- own venue), "public read", and the privileged-column trigger.

drop policy if exists "facilities: authenticated claim" on public.facilities;
drop policy if exists "facilities: authenticated suggest" on public.facilities;

-- Belt and braces: anon has no INSERT/UPDATE/DELETE policy, so RLS already
-- blocks it, but it has no business holding the table privileges either.
revoke insert, update, delete, truncate on public.facilities from anon;
-- TRUNCATE ignores RLS entirely; PostgREST cannot issue it, but nobody but the
-- service role should hold it.
revoke truncate on public.facilities from authenticated;
