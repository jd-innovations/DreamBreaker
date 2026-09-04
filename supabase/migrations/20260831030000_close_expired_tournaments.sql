-- Tournaments that are over stop looking open, and stop being registerable.
-- (TODO1.1 — the tournament lifecycle defect.)
--
-- ── What was actually wrong ─────────────────────────────────────────────────
--
-- The plan records this as "a player can register for an event that already
-- happened". Checked against production on 2026-08-31, that was not true: every
-- past-dated tournament was either cancelled or had a registration_closes_at in
-- the past, so fn_enforce_registration_close rejected the insert. The accurate
-- statement is narrower and has two halves.
--
-- 1. DISPLAY. Nothing ever moves a tournament out of 'open'. "First Strike -
--    SRQ Dink District" (event_date 2026-08-22) was still 'open' nine days
--    later, so it appeared in open-tournament listings. A player could start a
--    registration flow that could only fail at the final step — the worst place
--    to learn it.
--
-- 2. A LATENT HOLE. fn_enforce_registration_close never looked at event_date. It
--    depended entirely on registration_closes_at, which is nullable and null on
--    at least one existing row. A tournament created without one and left 'open'
--    would have accepted registrations indefinitely, including years later.
--
-- So this migration does two separate things, and the order matters: the guard
-- is the one that must be right, because the sweeper is periodic and a periodic
-- job is not a security boundary.

-- ── 1. The guard: never accept a registration for a finished event ──────────
--
-- Unchanged except for the event_date test. Kept as a whole replacement rather
-- than a patch so the entire accept/reject contract is readable in one place.
--
-- `event_date < current_date` is deliberately generous. event_date is a DATE and
-- the venue's timezone is not stored anywhere, so "is it over yet" cannot be
-- answered precisely. Rejecting only from the day AFTER means a same-day
-- walk-up registration still works, which is the behaviour a tournament desk
-- expects. Erring the other way would refuse legitimate morning-of sign-ups for
-- anyone west of the database.

create or replace function public.fn_enforce_registration_close() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
  v_closes_at timestamptz;
  v_status tournament_status;
  v_event_date date;
  v_is_sub boolean;
begin
  select registration_closes_at, status, event_date
    into v_closes_at, v_status, v_event_date
    from public.tournaments where id = new.tournament_id;

  v_is_sub := (new.replaces_registration_id is not null);

  if v_status in ('cancelled', 'completed') then
    raise exception 'Tournament % is % — registrations not accepted.', new.tournament_id, v_status
      using errcode = 'P0001';
  end if;

  -- New. Independent of registration_closes_at on purpose: that column is
  -- nullable, and a null one used to mean "open forever".
  if not v_is_sub and v_event_date is not null and v_event_date < current_date then
    raise exception 'Tournament % finished on % — registrations not accepted.', new.tournament_id, v_event_date
      using errcode = 'P0002';
  end if;

  if not v_is_sub and v_closes_at is not null and now() > v_closes_at then
    raise exception 'Registration for tournament % closed at %.', new.tournament_id, v_closes_at
      using errcode = 'P0002';
  end if;

  return new;
end; $$;

alter function public.fn_enforce_registration_close() owner to postgres;

-- Substitutions (replaces_registration_id set) still bypass both time checks,
-- exactly as before: a director swapping a player after the window closes is
-- the case that rule exists for.

-- ── 2. The sweeper: stop showing finished events as open ────────────────────

create or replace function public.close_expired_tournament_registration()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_closed integer;
begin
  update public.tournaments
     set status = 'registration_closed'
   where status in ('open', 'filling_fast')
     and (
       (registration_closes_at is not null and now() > registration_closes_at)
       or event_date < current_date
     );
  get diagnostics v_closed = row_count;
  return v_closed;
end;
$$;

comment on function public.close_expired_tournament_registration() is
  'Moves open/filling_fast tournaments to registration_closed once their '
  'registration window has passed or their event date is behind us. Scheduled '
  'every 15 minutes. Deliberately does NOT advance to in_progress or '
  'completed — see the migration for why.';

revoke all on function public.close_expired_tournament_registration() from public;
grant execute on function public.close_expired_tournament_registration() to service_role;

-- Why it stops at registration_closed, and goes no further:
--
-- 'in_progress' and 'completed' are claims about the real world that a clock
-- cannot verify. An event can be postponed on the morning, run a day long, or
-- be abandoned for weather. 'completed' in particular is load-bearing —
-- fn_enforce_registration_close rejects on it, and results and payouts read as
-- if the event finished normally. A cron job asserting that on a date alone
-- would be guessing about money.
--
-- registration_closed claims only what the clock genuinely knows: you cannot
-- sign up any more. Moving a tournament onward stays a director's action.

-- ── 3. Backfill ─────────────────────────────────────────────────────────────
--
-- The sweeper only runs from now on. Without this, "First Strike" stays open
-- until the first scheduled run, and any similar row stays wrong for as long as
-- it takes someone to notice.

select public.close_expired_tournament_registration();

-- ── 4. Schedule ─────────────────────────────────────────────────────────────
--
-- Every 15 minutes, matching waitlist-sweeper and push-receipt-sweeper. The job
-- calls the function directly rather than going through an edge function: there
-- is no external service involved, so an HTTP hop would only add a failure mode.

select cron.schedule(
  'close-expired-tournament-registration',
  '*/15 * * * *',
  $$select public.close_expired_tournament_registration();$$
);
