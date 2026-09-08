-- =============================================================================
-- Close the three fabricated tournaments left over from early development
-- =============================================================================
-- Written 2026-08-25, follow-up to item 6.1. Run against PRODUCTION.
--
-- These three are seeded demo data, not events anyone intended to run. All were
-- created 2026-06-14 / 2026-07-04, all are past their event date, all are still
-- `open` for registration, and each advertises a prize pool that was never
-- backed by anything:
--
--   Paddletek Classic       Jul 11   $1,500   0 registrants
--   Summer Slam Showdown    Aug 14   $5,000   0 registrants
--   Lakewood Ranch Classic  Aug 16   $2,500   1 registrant (the maintainer)
--
-- Summer Slam is the one that used to claim `spots_filled = 82` of 112. Item
-- 6.1 corrected the count; this removes the listing itself.
--
-- `cancelled` rather than `completed`: none of these events happened, and
-- `completed` implies results that do not exist. `cancelled` is excluded from
-- VISIBLE_STATUSES on mobile and from the web browse filter, so they leave both
-- public lists while remaining in the director's own view.
--
-- Side effect, checked first: trg_notify_tournament_status inserts in-app
-- notifications for the director and for registrants whose status is
-- registered/checked_in/substitute. It sends NO email on the cancelled branch —
-- emails fire only on the `open` and `draft` branches. The sole affected
-- registrant is the maintainer's own account on Lakewood Ranch Classic.
--
-- DELIBERATELY NOT INCLUDED:
--
--   First Strike - SRQ Dink District (Aug 22, $0 prize, draw 120, created the
--   day before the event) — past-dated and still `open`, but this reads as a
--   real event rather than seed data. Whether it belongs in `completed` or
--   `cancelled` depends on whether it actually ran, which only the director
--   knows. Left for a human.
--
--   Suncoast classic sRQ (Sep 28) — future-dated. Correctly `open`.
--
-- The underlying defect is untouched by this script: **nothing moves a
-- tournament out of `open` when its event date passes.** That is a missing
-- lifecycle rule and wants its own item; this only clears the current backlog.
-- =============================================================================

update public.tournaments
   set status = 'cancelled'
 where name in ('Paddletek Classic', 'Summer Slam Showdown', 'Lakewood Ranch Classic')
   and status::text <> 'cancelled';
-- expected: UPDATE 3


-- ─── Verification ────────────────────────────────────────────────────────────

-- Expect exactly two rows: First Strike (past, left for a human) and
-- Suncoast classic sRQ (future, correctly open).
select name, status::text, event_date, (event_date < current_date) as in_the_past
  from public.tournaments
 where status::text in ('open', 'filling_fast', 'registration_closed', 'in_progress')
 order by event_date;

-- Expect 0: no publicly listed tournament should advertise a prize pool with
-- no entrants any more.
select count(*) as public_tournaments_with_prize_and_no_entrants
  from public.tournaments t
 where t.status::text in ('open', 'filling_fast', 'registration_closed', 'in_progress')
   and coalesce(t.prize_pool_cents, 0) > 0
   and (select count(*) from public.registrations r
         where r.tournament_id = t.id
           and r.status::text in ('held','registered','checked_in','substitute')) = 0;


-- ─── Rollback ────────────────────────────────────────────────────────────────
--
-- update public.tournaments set status = 'open'
--  where name in ('Paddletek Classic','Summer Slam Showdown','Lakewood Ranch Classic');
--
-- Re-opening fires the `open` branch of trg_notify_tournament_status, which
-- DOES send a "tournament approved" email to the director. Expect three emails.
