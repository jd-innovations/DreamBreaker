-- ─────────────────────────────────────────────────────────────────────────────
-- Director day-of registration: walk-ins after registration closes.
--
-- fn_enforce_registration_close() refused EVERY insert once
-- registration_closes_at had passed, director-added ones included. So on
-- tournament day, when the window is shut and walk-ins and no-show replacements
-- actually happen, director_add_tournament_registration() could not be used.
--
-- Change: a registration the tournament's own director adds skips the
-- registration_closes_at check. Everything else stays the same:
--   * cancelled / completed tournaments still refuse everyone;
--   * nobody can register after the event date (still `event_date <
--     current_date`, the same generous day-of boundary as before);
--   * players' self-service registration still closes at registration_closes_at.
--
-- Who can reach the bypass, checked against production policies on 2026-09-28:
--   * "registrations: player insert own" requires director_added = false, so a
--     player cannot set the flag on their own insert;
--   * the old direct director INSERT policy was dropped in 20260821030000, so
--     director_add_tournament_registration() (security definer) is the only
--     writer of director_added = true. It sets added_by_director_id = auth.uid()
--     only after checking that caller is tournaments.director_id and
--     is_approved_director();
--   * "admin full access" is trusted.
-- The bypass requires the flag AND added_by_director_id = this tournament's
-- director_id, so it does not trust the flag on its own. The trigger is BEFORE
-- INSERT only, so later UPDATEs cannot use it.
--
-- Payment is unchanged: the RPC still refuses priced divisions
-- (division_requires_payment).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_enforce_registration_close() returns trigger
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
  v_closes_at timestamptz;
  v_status tournament_status;
  v_event_date date;
  v_director_id uuid;
  v_is_sub boolean;
  v_is_director_add boolean;
begin
  select registration_closes_at, status, event_date, director_id
    into v_closes_at, v_status, v_event_date, v_director_id
    from public.tournaments where id = new.tournament_id;

  v_is_sub := (new.replaces_registration_id is not null);
  v_is_director_add := coalesce(new.director_added, false)
    and new.added_by_director_id is not null
    and new.added_by_director_id = v_director_id;

  if v_status in ('cancelled', 'completed') then
    raise exception 'Tournament % is % — registrations not accepted.', new.tournament_id, v_status
      using errcode = 'P0001';
  end if;

  -- Independent of registration_closes_at on purpose: that column is
  -- nullable, and a null one used to mean "open forever".
  if not v_is_sub and v_event_date is not null and v_event_date < current_date then
    raise exception 'Tournament % finished on % — registrations not accepted.', new.tournament_id, v_event_date
      using errcode = 'P0002';
  end if;

  -- The director's own adds (walk-ins, day-of replacements) skip the window.
  if not v_is_sub and not v_is_director_add
     and v_closes_at is not null and now() > v_closes_at then
    raise exception 'Registration for tournament % closed at %.', new.tournament_id, v_closes_at
      using errcode = 'P0002';
  end if;

  return new;
end; $$;

alter function public.fn_enforce_registration_close() owner to postgres;
