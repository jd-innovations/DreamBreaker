-- ─────────────────────────────────────────────────────────────────────────────
-- Tournament courts: the director's real court list, and one live match per
-- court.
--
-- Before: the mobile court picker was hard-coded to Courts 1-6, nothing
-- stopped two unfinished matches sharing a court, and the venue's court count
-- (facilities.court_count) was unreliable (0 on linked facilities, absent for
-- typed venues).
--
-- 1. tournaments.courts text[]: the courts reserved for this event, in the
--    director's order, by their real names ("7", "12", "Stadium"). The
--    count shown to players is its length. bracket_matches.court was already
--    text, so match history needs no change.
-- 2. set_tournament_courts(): the only way to change the list after creation.
--    "tournaments: director update own" refuses every edit once a tournament
--    is in_progress, but courts change on the day. This SECURITY DEFINER
--    function lets the tournament's approved director set ONLY this column,
--    in any status except completed / cancelled. It normalizes the input:
--    trims, drops blanks, dedupes case-insensitively keeping first order,
--    caps each name at 24 chars and the list at 64.
-- 3. A partial unique index: at most one UNFINISHED match per court per
--    tournament, across every division. A court frees itself when the match's
--    score is saved (completed_at set). The match keeps its court as a record
--    of where it was played. The index also settles two directors assigning
--    the same court at once. Production had no violating rows on 2026-09-28.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Column ───────────────────────────────────────────────────────────────

alter table public.tournaments
  add column if not exists courts text[];

alter table public.tournaments
  add constraint tournaments_courts_size
    check (courts is null or cardinality(courts) between 1 and 64);

comment on column public.tournaments.courts is
  'Courts reserved for this tournament, by real name, in display order. '
  'Set on create, or via set_tournament_courts() (works while in_progress).';

-- ── 2. Setter ───────────────────────────────────────────────────────────────

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

  -- Normalize: trim, drop blanks, dedupe case-insensitively keeping the first
  -- occurrence's position.
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

  return v_clean;
end;
$$;

alter function public.set_tournament_courts(uuid, text[]) owner to postgres;
revoke all on function public.set_tournament_courts(uuid, text[]) from public;
revoke all on function public.set_tournament_courts(uuid, text[]) from anon;
grant execute on function public.set_tournament_courts(uuid, text[]) to authenticated, service_role;

-- ── 3. One unfinished match per court ───────────────────────────────────────

create unique index if not exists bracket_matches_one_live_match_per_court
  on public.bracket_matches (tournament_id, court)
  where court is not null and completed_at is null;
