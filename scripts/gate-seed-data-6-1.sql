-- =============================================================================
-- TODO 1.1 item 6.1 — Remove or Gate Mock Data (production data half)
-- =============================================================================
-- Written 2026-08-25. Run against the PRODUCTION project (fbzetvkbhneptvfruilw)
-- in the Supabase SQL editor.
--
-- Covers two of the approved actions:
--
--   A3  Hide the 17 seeded profiles from partner discovery.
--   A4  Cancel the four test tournaments so they leave the public browse list.
--
-- It does NOT delete anything. Every statement here is reversible, and the
-- rollback for each is at the bottom of the file.
--
-- Deliberately NOT in this script (not yet approved):
--   A1  deleting the four `11111111-…` seed players and their row graph
--   A2  running supabase/seed/coach_marketplace_dev_seed_reset.sql
--
-- No service_role JWT is needed. The only BEFORE UPDATE guards on `profiles`
-- (fn_protect_coach_status_transitions, fn_protect_coach_commission_override)
-- fire only when their own columns change, and neither column is touched here.
-- =============================================================================


-- ─── A3. Hide seeded profiles from discovery ─────────────────────────────────
--
-- Why the flag and not a code change: `useFinderCandidates.ts` already filters
-- `.eq('is_discoverable', true)`, so this takes effect on every install that is
-- already in the field. A client-side exclusion would only reach users after a
-- new EAS build.
--
-- Affects 17 rows: 4 sample players (11111111-…-1111111101..04) and 13 seeded
-- coaches (c0ac0000-…-000000000001..13). All 17 are currently discoverable.
--
-- Note: this covers the mobile partner finder and onboarding's area
-- recommendations. Web /matchmaking does NOT filter on this flag — see the
-- note at the end of this file.

update public.profiles
   set is_discoverable = false
 where id::text ~ '^(11111111|c0ac0000)'
   and is_discoverable is true;
-- expected: UPDATE 17


-- ─── A4. Cancel the four test tournaments ────────────────────────────────────
--
-- Cancel, not delete. "Test payments" and "Caledar Tournament Test" carry real
-- test-mode Stripe intents (4 and 3) and refund rows (1 and 2) that the item
-- 3.3 reconciliation queue and docs/PAYMENT_RECONCILIATION_RUNBOOK.md read.
-- Deleting the tournaments would destroy that history. `cancelled` is excluded
-- from VISIBLE_STATUSES on mobile and from the web browse filter, so the rows
-- leave both public lists while staying in the director's own view.
--
-- Side effect, checked before writing this: trg_notify_tournament_status
-- inserts in-app notifications to the director and to registrants whose status
-- is registered/checked_in/substitute. It sends NO email on the cancelled
-- branch (emails fire only on the `open` and `draft` branches). The four
-- recipients are all accounts belonging to the maintainer:
--   Bryce Harper (jd@structure2trade.com)      × 2
--   Jesus Dominguez (dhjesus122@gmail.com)     × 1
--   Dtester 3 Dominguez (…+dtester3@gmail.com) × 1

update public.tournaments
   set status = 'cancelled'
 where name in ('Test payments', 'Caledar Tournament Test', 'Test Small ❤️', 'Yes SRQ')
   and status <> 'cancelled';
-- expected: UPDATE 4

-- Deliberately untouched, because they were not named as test data:
--   Lakewood Ranch Classic, Paddletek Classic, Summer Slam Showdown,
--   First Strike - SRQ Dink District, DD- Men's doubles 1, Suncoast classic sRQ
-- Lakewood Ranch Classic still holds the four fake paid registrations (A1).


-- ─── Verification ────────────────────────────────────────────────────────────

-- Expect 0 rows.
select id, full_name, is_discoverable
  from public.profiles
 where id::text ~ '^(11111111|c0ac0000)'
   and is_discoverable is true;

-- Expect the four test tournaments to be absent.
select name, status
  from public.tournaments
 where status in ('open', 'filling_fast', 'registration_closed', 'in_progress', 'completed')
 order by event_date;

-- Expect 17 / 4.
select
  (select count(*) from public.profiles
    where id::text ~ '^(11111111|c0ac0000)' and is_discoverable is false) as hidden_seed_profiles,
  (select count(*) from public.tournaments
    where name in ('Test payments','Caledar Tournament Test','Test Small ❤️','Yes SRQ')
      and status = 'cancelled') as cancelled_test_tournaments;


-- ─── Rollback ────────────────────────────────────────────────────────────────
--
-- update public.profiles
--    set is_discoverable = true
--  where id::text ~ '^(11111111|c0ac0000)';
--
-- update public.tournaments
--    set status = 'open'
--  where name in ('Test payments','Caledar Tournament Test','Test Small ❤️','Yes SRQ');
--
-- Re-opening fires the `open` branch of trg_notify_tournament_status, which
-- DOES send a "tournament approved" email to the director. Expect four emails
-- if you roll A4 back.


-- ─── Known gap this script does not close ────────────────────────────────────
--
-- web/src/app/matchmaking/page.tsx:306-311 selects candidate profiles filtered
-- only by `role = 'player'` — it never checks `is_discoverable`. So after this
-- script the seeded profiles are gone from the mobile finder but still appear
-- on web matchmaking.
--
-- That same line is also a real privacy defect independent of seed data: a user
-- who switches discovery off in Match Settings is still shown to other users on
-- web. The fix is one line, but it is a behaviour change in a file outside the
-- approved scope of 6.1 items 1-2, so it is flagged rather than applied.
