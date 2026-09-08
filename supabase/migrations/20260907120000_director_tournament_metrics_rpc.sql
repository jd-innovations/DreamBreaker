-- F5 (PERFORMANCE_REGRESSION_AUDIT.md): Director Hub's loadSnapshots() fetched
-- divisions + registrations for every visible tournament in a per-tournament
-- Promise.all, wired to useFocusEffect — an N+1 fan-out that re-runs on every
-- focus. ce32530 already scoped it to the status-filtered subset, but the
-- pattern itself remained N+1. This folds the whole thing into one query.
--
-- SECURITY INVOKER (the default — no SECURITY DEFINER here), so it runs under
-- the calling director's own permissions and existing RLS does the same job
-- it already does for the direct-table-read code this replaces: "registrations:
-- director read own tournament" and "divisions: director manage own" already
-- restrict a director to their own tournaments' rows. A director who passes
-- another director's tournament id gets zero rows back for it, not an error —
-- same behavior as the two direct queries it replaces, just batched.
--
-- Mirrors apps/mobile/src/app/director.tsx's loadSnapshots() metric math and
-- apps/mobile/src/lib/supabase/registrations.ts's dbStatusToAppStatus() exactly:
--   - 'held' and 'expired_hold' registrations are excluded up front (same as
--     fetchTournamentRegistrations()'s `.not('status','in','(held,expired_hold)')`)
--   - app_status collapses 'waitlisted'/'waitlist_offered' -> waitlisted,
--     'withdrawn'/'disqualified' -> cancelled, 'checked_in' -> checked_in,
--     'no_show' -> no_show, everything else -> registered
--   - total/registered/checked_in/waitlisted/no_show exclude cancelled
--   - revenue_cents sums entry_fee_paid_cents over everything but cancelled
--     (no_show included, matching the client's `active.reduce(...)`)
--   - outstanding_cents sums balance-due over everything but cancelled AND
--     no_show, where balance-due is division fee (falling back to the
--     tournament fee) minus what's already been paid, floored at 0 — same as
--     effectiveEntryFeeCents() + balanceDueCents() in tournamentFees.ts

CREATE OR REPLACE FUNCTION "public"."get_director_tournament_metrics"(p_tournament_ids uuid[])
RETURNS TABLE (
  tournament_id     uuid,
  div_count         integer,
  total             integer,
  registered        integer,
  checked_in        integer,
  waitlisted        integer,
  no_show           integer,
  cancelled         integer,
  revenue_cents     integer,
  outstanding_cents integer
)
LANGUAGE sql
STABLE
SET search_path = 'public', 'pg_temp'
AS $function$
  WITH div_counts AS (
    SELECT d.tournament_id, count(*)::int AS div_count
    FROM "public"."divisions" d
    WHERE d.tournament_id = ANY(p_tournament_ids)
    GROUP BY d.tournament_id
  ),
  regs AS (
    SELECT
      r.tournament_id,
      r.entry_fee_paid_cents,
      GREATEST(0, COALESCE(d.entry_fee_cents, t.entry_fee_cents, 0) - r.entry_fee_paid_cents) AS balance_due_cents,
      CASE
        WHEN r.status = 'checked_in' THEN 'checked_in'
        WHEN r.status IN ('waitlisted', 'waitlist_offered') THEN 'waitlisted'
        WHEN r.status IN ('withdrawn', 'disqualified') THEN 'cancelled'
        WHEN r.status = 'no_show' THEN 'no_show'
        ELSE 'registered'
      END AS app_status
    FROM "public"."registrations" r
    JOIN "public"."tournaments" t ON t.id = r.tournament_id
    LEFT JOIN "public"."divisions" d ON d.id = r.division_id
    WHERE r.tournament_id = ANY(p_tournament_ids)
      AND r.status NOT IN ('held', 'expired_hold')
  )
  SELECT
    ids.id AS tournament_id,
    COALESCE(dc.div_count, 0) AS div_count,
    COALESCE(count(*) FILTER (WHERE regs.app_status != 'cancelled'), 0)::int AS total,
    COALESCE(count(*) FILTER (WHERE regs.app_status = 'registered'), 0)::int AS registered,
    COALESCE(count(*) FILTER (WHERE regs.app_status = 'checked_in'), 0)::int AS checked_in,
    COALESCE(count(*) FILTER (WHERE regs.app_status = 'waitlisted'), 0)::int AS waitlisted,
    COALESCE(count(*) FILTER (WHERE regs.app_status = 'no_show'), 0)::int AS no_show,
    COALESCE(count(*) FILTER (WHERE regs.app_status = 'cancelled'), 0)::int AS cancelled,
    COALESCE(sum(regs.entry_fee_paid_cents) FILTER (WHERE regs.app_status != 'cancelled'), 0)::int AS revenue_cents,
    COALESCE(sum(regs.balance_due_cents) FILTER (WHERE regs.app_status NOT IN ('cancelled', 'no_show')), 0)::int AS outstanding_cents
  FROM unnest(p_tournament_ids) AS ids(id)
  LEFT JOIN div_counts dc ON dc.tournament_id = ids.id
  LEFT JOIN regs ON regs.tournament_id = ids.id
  GROUP BY ids.id, dc.div_count;
$function$;

COMMENT ON FUNCTION "public"."get_director_tournament_metrics"(uuid[]) IS
  'One-query replacement for director.tsx loadSnapshots()''s per-tournament fetchDivisionsForTournament + fetchTournamentRegistrations fan-out (F5, PERFORMANCE_REGRESSION_AUDIT.md). SECURITY INVOKER — relies on existing registrations/divisions RLS to scope results to the caller''s own tournaments.';

-- Callable directly by directors from the client (unlike promote_next_waitlisted,
-- this is SECURITY INVOKER with no elevated privilege — RLS does the real
-- restricting, so there is no privilege-escalation risk in granting this to
-- every authenticated user the way there would be for a SECURITY DEFINER function).
REVOKE ALL ON FUNCTION "public"."get_director_tournament_metrics"(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_director_tournament_metrics"(uuid[]) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_director_tournament_metrics"(uuid[]) TO "authenticated";
