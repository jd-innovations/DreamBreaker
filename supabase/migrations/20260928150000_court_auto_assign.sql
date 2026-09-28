-- ─────────────────────────────────────────────────────────────────────────────
-- Court auto-assignment: keep courts busy.
--
-- When a court frees up (its match's score is saved) it is given at once to
-- the next match in a tournament-wide queue. When a match becomes ready (both
-- teams known, e.g. a winner just advanced) and a court is free, it takes it.
-- Runs in the database, so it fires whoever enters the score (mobile, web,
-- another director). Builds on 20260928140000 (tournaments.courts and the
-- one-live-match-per-court index).
--
-- Queue: "first ready, first played" (owner's choice, 2026-09-28).
--   Eligible: unfinished, no court, both teams known, and NO player (profile or
--   guest) currently on another court in this tournament. That last rule
--   covers anyone entered in two divisions.
--   Order: ready_at (when the second team arrived), then round (earlier
--   first), then match number, then division. Ties interleave divisions. A
--   team that just won joins the back, which also gives it a rest.
--
-- Switch: tournaments.auto_assign_courts, on by default (owner's choice).
--   It only fills EMPTY courts and never moves a match already on one. Manual
--   assign / clear still works. Toggled through set_tournament_auto_assign_courts(),
--   because the director update policy refuses in_progress tournaments.
--
-- Safety:
--   * fn_fill_free_courts takes a per-tournament transaction advisory lock,
--     so two scores saved at once fill courts one after the other.
--   * Each assignment catches unique_violation, so a clash can never make the
--     caller's score save fail.
--   * The automation's own court updates run at trigger depth > 1 and are
--     ignored by the automation trigger, so there is no recursion.
--   * fn_fill_free_courts is SECURITY DEFINER with no grants. Only the trigger
--     and the two director RPCs reach it. It writes nothing but `court`, and
--     only on matches of the tournament whose event fired it.
--   * court_queue() is SECURITY INVOKER, so the app's "Up next" read is
--     governed by bracket_matches RLS like any other read.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columns ──────────────────────────────────────────────────────────────

alter table public.bracket_matches
  add column if not exists ready_at timestamptz;

comment on column public.bracket_matches.ready_at is
  'When both teams became known: the court queue''s "first ready, first played" order. '
  'Maintained by trg_bracket_match_ready_at; null while a side is still undetermined.';

alter table public.tournaments
  add column if not exists auto_assign_courts boolean not null default true;

comment on column public.tournaments.auto_assign_courts is
  'Give a freed court to the next queued match automatically. Changed via '
  'set_tournament_auto_assign_courts().';

-- ── 2. ready_at maintenance ─────────────────────────────────────────────────

create or replace function public.fn_bracket_match_ready_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(new.team1_player_a, new.team1_guest_a) is not null
     and coalesce(new.team2_player_a, new.team2_guest_a) is not null then
    if new.ready_at is null then
      new.ready_at := now();
    end if;
  else
    new.ready_at := null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_bracket_match_ready_at on public.bracket_matches;
create trigger trg_bracket_match_ready_at
  before insert or update on public.bracket_matches
  for each row execute function public.fn_bracket_match_ready_at();

-- Matches already waiting get their readiness from their last change. Done
-- BEFORE the automation trigger exists, so the backfill doesn't fire it row by
-- row in an arbitrary order.
update public.bracket_matches
   set ready_at = coalesce(updated_at, created_at)
 where ready_at is null
   and completed_at is null
   and coalesce(team1_player_a, team1_guest_a) is not null
   and coalesce(team2_player_a, team2_guest_a) is not null;

-- ── 3. The queue ────────────────────────────────────────────────────────────

create or replace function public.fn_round_order(p_round text)
returns integer
language sql
immutable
as $$
  select case p_round
    when 'pool'   then 0
    when 'r64'    then 1
    when 'r32'    then 2
    when 'r16'    then 3
    when 'qf'     then 4
    when 'sf'     then 5
    when 'bronze' then 6
    when 'final'  then 7
    else 8
  end;
$$;

-- Every match waiting for a court, in the order courts will be given out.
-- The single definition used by the automation AND by the app's "Up next".
create or replace function public.court_queue(p_tournament_id uuid)
returns table (match_id uuid, queue_position integer)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  select m.id,
         (row_number() over (
            order by m.ready_at, public.fn_round_order(m.round::text), m.match_number, m.division_id
          ))::integer
    from public.bracket_matches m
   where m.tournament_id = p_tournament_id
     and m.completed_at is null
     and m.court is null
     and m.ready_at is not null
     -- Nobody in this match may be on another court right now.
     and not exists (
       select 1
         from public.bracket_matches o
        where o.tournament_id = p_tournament_id
          and o.court is not null
          and o.completed_at is null
          and array_remove(array[o.team1_player_a, o.team1_player_b, o.team2_player_a, o.team2_player_b,
                                 o.team1_guest_a,  o.team1_guest_b,  o.team2_guest_a,  o.team2_guest_b], null)
           && array_remove(array[m.team1_player_a, m.team1_player_b, m.team2_player_a, m.team2_player_b,
                                 m.team1_guest_a,  m.team1_guest_b,  m.team2_guest_a,  m.team2_guest_b], null)
       )
   order by 2;
$$;

revoke all on function public.court_queue(uuid) from public;
revoke all on function public.court_queue(uuid) from anon;
grant execute on function public.court_queue(uuid) to authenticated, service_role;

-- ── 4. Filling free courts ──────────────────────────────────────────────────

create or replace function public.fn_fill_free_courts(p_tournament_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_courts   text[];
  v_auto     boolean;
  v_status   tournament_status;
  v_court    text;
  v_match    uuid;
  v_assigned integer := 0;
begin
  select courts, auto_assign_courts, status
    into v_courts, v_auto, v_status
    from public.tournaments
   where id = p_tournament_id;

  if not found or not v_auto or v_courts is null or cardinality(v_courts) = 0
     or v_status in ('cancelled', 'completed') then
    return 0;
  end if;

  -- One filler per tournament at a time.
  perform pg_advisory_xact_lock(hashtextextended('fill_free_courts:' || p_tournament_id::text, 0));

  -- Courts in the director's order; each free one takes the queue head.
  foreach v_court in array v_courts loop
    continue when exists (
      select 1 from public.bracket_matches m
       where m.tournament_id = p_tournament_id
         and m.court = v_court
         and m.completed_at is null
    );

    v_match := null;
    select q.match_id into v_match
      from public.court_queue(p_tournament_id) q
     order by q.queue_position
     limit 1;

    -- The queue doesn't depend on which court is free, so an empty queue
    -- means nothing is left for any court.
    exit when v_match is null;

    begin
      update public.bracket_matches
         set court = v_court, updated_at = now()
       where id = v_match
         and court is null
         and completed_at is null;
      if found then
        v_assigned := v_assigned + 1;
      end if;
    exception when unique_violation then
      -- Taken in the meantime; never fail the caller's score save over it.
      null;
    end;
  end loop;

  return v_assigned;
end; $$;

alter function public.fn_fill_free_courts(uuid) owner to postgres;
revoke all on function public.fn_fill_free_courts(uuid) from public;
revoke all on function public.fn_fill_free_courts(uuid) from anon;
revoke all on function public.fn_fill_free_courts(uuid) from authenticated;

-- ── 5. The automation trigger ───────────────────────────────────────────────

create or replace function public.fn_bracket_court_automation()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Ignore the automation's own court writes (and any nested write).
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if tg_op = 'INSERT' then
    if new.ready_at is not null and new.completed_at is null then
      perform public.fn_fill_free_courts(new.tournament_id);
    end if;
    return null;
  end if;

  -- A court was freed by a finished match, or a match just became ready.
  if (old.completed_at is null and new.completed_at is not null and old.court is not null)
     or (old.ready_at is null and new.ready_at is not null and new.completed_at is null) then
    perform public.fn_fill_free_courts(new.tournament_id);
  end if;

  return null;
end; $$;

alter function public.fn_bracket_court_automation() owner to postgres;

drop trigger if exists trg_bracket_court_automation on public.bracket_matches;
create trigger trg_bracket_court_automation
  after insert or update on public.bracket_matches
  for each row execute function public.fn_bracket_court_automation();

-- ── 6. Director RPCs ────────────────────────────────────────────────────────

create or replace function public.set_tournament_auto_assign_courts(
  p_tournament_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor  uuid := auth.uid();
  v_status tournament_status;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select t.status into v_status
    from public.tournaments t
   where t.id = p_tournament_id and t.director_id = v_actor;

  if not found then
    raise exception 'not_tournament_director' using errcode = 'P0002';
  end if;

  if not public.is_approved_director() then
    raise exception 'director_not_approved' using errcode = 'P0003';
  end if;

  if v_status in ('completed', 'cancelled') then
    raise exception 'tournament_closed' using errcode = 'P0004';
  end if;

  update public.tournaments
     set auto_assign_courts = coalesce(p_enabled, true)
   where id = p_tournament_id;

  -- Turning it on puts idle courts to work immediately.
  if coalesce(p_enabled, true) then
    perform public.fn_fill_free_courts(p_tournament_id);
  end if;

  return coalesce(p_enabled, true);
end; $$;

alter function public.set_tournament_auto_assign_courts(uuid, boolean) owner to postgres;
revoke all on function public.set_tournament_auto_assign_courts(uuid, boolean) from public;
revoke all on function public.set_tournament_auto_assign_courts(uuid, boolean) from anon;
grant execute on function public.set_tournament_auto_assign_courts(uuid, boolean) to authenticated, service_role;

-- set_tournament_courts (20260928140000), unchanged, except that it now fills
-- any court the new list opens up.
create or replace function public.set_tournament_courts(
  p_tournament_id uuid,
  p_courts text[]
)
returns text[]
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor  uuid := auth.uid();
  v_status tournament_status;
  v_clean  text[];
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select t.status into v_status
    from public.tournaments t
   where t.id = p_tournament_id and t.director_id = v_actor;

  if not found then
    raise exception 'not_tournament_director' using errcode = 'P0002';
  end if;

  if not public.is_approved_director() then
    raise exception 'director_not_approved' using errcode = 'P0003';
  end if;

  if v_status in ('completed', 'cancelled') then
    raise exception 'tournament_closed' using errcode = 'P0004';
  end if;

  select array_agg(name order by first_pos)
    into v_clean
    from (
      select min(ord) as first_pos, (array_agg(name order by ord))[1] as name
        from (
          select btrim(c) as name, ord
            from unnest(coalesce(p_courts, '{}'::text[])) with ordinality as u(c, ord)
           where btrim(coalesce(c, '')) <> ''
        ) s
       group by lower(name)
    ) d;

  if v_clean is not null then
    if cardinality(v_clean) > 64 then
      raise exception 'too_many_courts' using errcode = 'P0005';
    end if;
    if exists (select 1 from unnest(v_clean) n where char_length(n) > 24) then
      raise exception 'court_name_too_long' using errcode = 'P0006';
    end if;
  end if;

  update public.tournaments
     set courts = v_clean
   where id = p_tournament_id;

  perform public.fn_fill_free_courts(p_tournament_id);

  return v_clean;
end;
$$;

-- ── 7. Put idle courts to work now ──────────────────────────────────────────
-- Tournaments that already have courts set and matches waiting.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.tournaments
     where courts is not null
       and auto_assign_courts
       and status not in ('cancelled', 'completed')
  loop
    perform public.fn_fill_free_courts(v_id);
  end loop;
end $$;
