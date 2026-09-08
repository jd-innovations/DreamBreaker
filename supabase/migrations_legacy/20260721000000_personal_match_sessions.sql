-- DreamBreaker PB - Personal match/session persistence
-- Phase 1: canonical backend foundation for the mobile log-session flow.
-- No PAR, notifications, claim links, activity feed, or AI processing here.

alter table public.profiles
  add column if not exists self_rating text;

create table if not exists public.personal_guest_players (
  id              uuid        primary key default gen_random_uuid(),
  created_by      uuid        not null references public.profiles(id) on delete cascade,
  display_name    text        not null,
  phone           text,
  email           text,
  estimated_skill text,
  gender          text,
  age_group       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint personal_guest_players_display_name_not_blank check (btrim(display_name) <> '')
);

create table if not exists public.personal_sessions (
  id             uuid        primary key default gen_random_uuid(),
  created_by     uuid        not null references public.profiles(id) on delete cascade,
  facility_id    uuid        references public.facilities(id) on delete set null,
  played_at      timestamptz not null default now(),
  format         text        not null check (format in ('singles', 'doubles')),
  status         text        not null default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled')),
  indoor_outdoor text        check (indoor_outdoor in ('indoor', 'outdoor', 'mixed', 'unknown')),
  notes          text,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint personal_sessions_completed_at_status check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  )
);

create table if not exists public.personal_session_participants (
  id                    uuid        primary key default gen_random_uuid(),
  session_id            uuid        not null references public.personal_sessions(id) on delete cascade,
  profile_id            uuid        references public.profiles(id) on delete restrict,
  guest_player_id       uuid        references public.personal_guest_players(id) on delete restrict,
  display_name_snapshot text        not null,
  estimated_skill       text,
  created_by            uuid        not null references public.profiles(id) on delete cascade,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint personal_session_participants_one_identity check (
    (profile_id is not null and guest_player_id is null)
    or (profile_id is null and guest_player_id is not null)
  ),
  constraint personal_session_participants_name_not_blank check (btrim(display_name_snapshot) <> '')
);

create unique index if not exists uq_personal_session_participants_profile
  on public.personal_session_participants(session_id, profile_id)
  where profile_id is not null;

create unique index if not exists uq_personal_session_participants_guest
  on public.personal_session_participants(session_id, guest_player_id)
  where guest_player_id is not null;

create table if not exists public.personal_games (
  id             uuid        primary key default gen_random_uuid(),
  session_id     uuid        not null references public.personal_sessions(id) on delete cascade,
  game_number    integer     not null check (game_number > 0),
  team_one_score integer     check (team_one_score is null or team_one_score >= 0),
  team_two_score integer     check (team_two_score is null or team_two_score >= 0),
  winning_team   integer     check (winning_team in (1, 2)),
  status         text        not null default 'draft' check (status in ('draft', 'completed', 'cancelled')),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint personal_games_unique_number unique (session_id, game_number),
  constraint personal_games_completed_fields check (
    status <> 'completed'
    or (
      team_one_score is not null
      and team_two_score is not null
      and winning_team is not null
      and completed_at is not null
      and team_one_score <> team_two_score
    )
  )
);

create table if not exists public.personal_game_participants (
  id                     uuid        primary key default gen_random_uuid(),
  game_id                uuid        not null references public.personal_games(id) on delete cascade,
  session_participant_id uuid        not null references public.personal_session_participants(id) on delete cascade,
  team_number            integer     not null check (team_number in (1, 2)),
  position               integer     not null check (position > 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint personal_game_participants_once_per_game unique (game_id, session_participant_id),
  constraint personal_game_participants_unique_position unique (game_id, team_number, position)
);

create index if not exists idx_personal_sessions_created_by on public.personal_sessions(created_by, played_at desc);
create index if not exists idx_personal_sessions_facility on public.personal_sessions(facility_id);
create index if not exists idx_personal_session_participants_profile on public.personal_session_participants(profile_id);
create index if not exists idx_personal_games_session on public.personal_games(session_id, game_number);
create index if not exists idx_personal_game_participants_session_participant on public.personal_game_participants(session_participant_id);

create trigger trg_personal_guest_players_updated_at
  before update on public.personal_guest_players
  for each row execute function public.fn_set_updated_at();

create trigger trg_personal_sessions_updated_at
  before update on public.personal_sessions
  for each row execute function public.fn_set_updated_at();

create trigger trg_personal_session_participants_updated_at
  before update on public.personal_session_participants
  for each row execute function public.fn_set_updated_at();

create trigger trg_personal_games_updated_at
  before update on public.personal_games
  for each row execute function public.fn_set_updated_at();

create trigger trg_personal_game_participants_updated_at
  before update on public.personal_game_participants
  for each row execute function public.fn_set_updated_at();

create or replace function public.is_personal_session_visible(p_session_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.personal_sessions s
     where s.id = p_session_id
       and (
         s.created_by = p_user_id
         or exists (
           select 1
             from public.personal_session_participants p
            where p.session_id = s.id
              and p.profile_id = p_user_id
         )
       )
  );
$$;

create or replace function public.ensure_personal_game_participant_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_session uuid;
  v_participant_session uuid;
begin
  select session_id into v_game_session
    from public.personal_games
   where id = new.game_id;

  select session_id into v_participant_session
    from public.personal_session_participants
   where id = new.session_participant_id;

  if v_game_session is null or v_participant_session is null or v_game_session <> v_participant_session then
    raise exception 'game_participant_session_mismatch'
      using errcode = 'P0001', hint = 'Game participants must belong to the same personal session as the game.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_personal_game_participant_session on public.personal_game_participants;
create trigger trg_personal_game_participant_session
  before insert or update on public.personal_game_participants
  for each row execute function public.ensure_personal_game_participant_session();

create or replace function public.personal_session_expected_players(p_format text)
returns integer
language sql
immutable
as $$
  select case when p_format = 'singles' then 2 else 4 end;
$$;

create or replace function public.validate_personal_game_ready(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_format text;
  v_expected_total integer;
  v_expected_team integer;
  v_total integer;
  v_team_one integer;
  v_team_two integer;
begin
  select s.format into v_format
    from public.personal_games g
    join public.personal_sessions s on s.id = g.session_id
   where g.id = p_game_id;

  if v_format is null then
    raise exception 'game_not_found' using errcode = 'P0001';
  end if;

  v_expected_total := public.personal_session_expected_players(v_format);
  v_expected_team := v_expected_total / 2;

  select count(*) into v_total
    from public.personal_game_participants
   where game_id = p_game_id;

  select count(*) into v_team_one
    from public.personal_game_participants
   where game_id = p_game_id and team_number = 1;

  select count(*) into v_team_two
    from public.personal_game_participants
   where game_id = p_game_id and team_number = 2;

  if v_total <> v_expected_total or v_team_one <> v_expected_team or v_team_two <> v_expected_team then
    raise exception 'invalid_personal_game_teams'
      using errcode = 'P0001', hint = 'Game teams do not match the session format.';
  end if;
end;
$$;

create or replace function public.add_personal_session_registered_participant(
  p_session_id uuid,
  p_profile_id uuid
)
returns public.personal_session_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.personal_sessions;
  v_profile public.profiles;
  v_row public.personal_session_participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_session
    from public.personal_sessions
   where id = p_session_id;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if v_session.created_by <> auth.uid() then
    raise exception 'not_session_creator' using errcode = 'P0001';
  end if;

  if v_session.status in ('completed', 'cancelled') then
    raise exception 'session_not_editable' using errcode = 'P0001';
  end if;

  select * into v_profile
    from public.profiles
   where id = p_profile_id;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  insert into public.personal_session_participants (
    session_id, profile_id, display_name_snapshot, estimated_skill, created_by
  ) values (
    p_session_id,
    p_profile_id,
    coalesce(nullif(btrim(v_profile.full_name), ''), v_profile.email, 'Player'),
    coalesce(v_profile.self_rating, v_profile.skill_level, v_profile.dupr::text),
    auth.uid()
  )
  on conflict (session_id, profile_id) where profile_id is not null
  do update set
    display_name_snapshot = excluded.display_name_snapshot,
    estimated_skill = excluded.estimated_skill
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.add_personal_session_guest_participant(
  p_session_id uuid,
  p_display_name text,
  p_estimated_skill text default null,
  p_phone text default null,
  p_email text default null
)
returns public.personal_session_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.personal_sessions;
  v_guest public.personal_guest_players;
  v_row public.personal_session_participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'guest_name_required' using errcode = 'P0001';
  end if;

  select * into v_session
    from public.personal_sessions
   where id = p_session_id;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if v_session.created_by <> auth.uid() then
    raise exception 'not_session_creator' using errcode = 'P0001';
  end if;

  if v_session.status in ('completed', 'cancelled') then
    raise exception 'session_not_editable' using errcode = 'P0001';
  end if;

  insert into public.personal_guest_players (
    created_by, display_name, phone, email, estimated_skill
  ) values (
    auth.uid(), btrim(p_display_name), nullif(btrim(coalesce(p_phone, '')), ''), nullif(lower(btrim(coalesce(p_email, ''))), ''), nullif(btrim(coalesce(p_estimated_skill, '')), '')
  )
  returning * into v_guest;

  insert into public.personal_session_participants (
    session_id, guest_player_id, display_name_snapshot, estimated_skill, created_by
  ) values (
    p_session_id, v_guest.id, v_guest.display_name, v_guest.estimated_skill, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.save_personal_game_score(
  p_game_id uuid,
  p_team_one_score integer,
  p_team_two_score integer
)
returns public.personal_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.personal_games;
  v_session public.personal_sessions;
  v_winning_team integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_team_one_score is null or p_team_two_score is null or p_team_one_score < 0 or p_team_two_score < 0 then
    raise exception 'invalid_score' using errcode = 'P0001';
  end if;

  if p_team_one_score = p_team_two_score then
    raise exception 'scores_cannot_tie' using errcode = 'P0001';
  end if;

  select * into v_game
    from public.personal_games
   where id = p_game_id;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0001';
  end if;

  select * into v_session
    from public.personal_sessions
   where id = v_game.session_id;

  if v_session.created_by <> auth.uid() then
    raise exception 'not_session_creator' using errcode = 'P0001';
  end if;

  if v_session.status in ('completed', 'cancelled') then
    raise exception 'session_not_editable' using errcode = 'P0001';
  end if;

  perform public.validate_personal_game_ready(p_game_id);

  v_winning_team := case when p_team_one_score > p_team_two_score then 1 else 2 end;

  update public.personal_games
     set team_one_score = p_team_one_score,
         team_two_score = p_team_two_score,
         winning_team = v_winning_team,
         status = 'completed',
         completed_at = coalesce(completed_at, now())
   where id = p_game_id
   returning * into v_game;

  update public.personal_sessions
     set status = case when status = 'draft' then 'active' else status end
   where id = v_session.id;

  return v_game;
end;
$$;

create or replace function public.complete_personal_session(
  p_session_id uuid,
  p_facility_id uuid default null,
  p_notes text default null,
  p_indoor_outdoor text default null
)
returns public.personal_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.personal_sessions;
  v_completed_games integer;
  v_participants integer;
  v_expected integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_session
    from public.personal_sessions
   where id = p_session_id;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if v_session.created_by <> auth.uid() then
    raise exception 'not_session_creator' using errcode = 'P0001';
  end if;

  if v_session.status = 'cancelled' then
    raise exception 'session_cancelled' using errcode = 'P0001';
  end if;

  select count(*) into v_completed_games
    from public.personal_games
   where session_id = p_session_id and status = 'completed';

  if v_completed_games < 1 then
    raise exception 'completed_game_required' using errcode = 'P0001';
  end if;

  select count(*) into v_participants
    from public.personal_session_participants
   where session_id = p_session_id;

  v_expected := public.personal_session_expected_players(v_session.format);
  if v_participants <> v_expected then
    raise exception 'invalid_session_participant_count' using errcode = 'P0001';
  end if;

  if p_indoor_outdoor is not null and p_indoor_outdoor not in ('indoor', 'outdoor', 'mixed', 'unknown') then
    raise exception 'invalid_indoor_outdoor' using errcode = 'P0001';
  end if;

  update public.personal_sessions
     set status = 'completed',
         facility_id = coalesce(p_facility_id, facility_id),
         notes = nullif(btrim(coalesce(p_notes, notes, '')), ''),
         indoor_outdoor = coalesce(p_indoor_outdoor, indoor_outdoor),
         completed_at = coalesce(completed_at, now())
   where id = p_session_id
   returning * into v_session;

  return v_session;
end;
$$;

alter table public.personal_guest_players enable row level security;
alter table public.personal_sessions enable row level security;
alter table public.personal_session_participants enable row level security;
alter table public.personal_games enable row level security;
alter table public.personal_game_participants enable row level security;

create policy "personal_guest_players: creator read"
  on public.personal_guest_players for select
  using (created_by = (select auth.uid()));

create policy "personal_guest_players: creator update"
  on public.personal_guest_players for update
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "personal_sessions: creator insert"
  on public.personal_sessions for insert
  with check (created_by = (select auth.uid()) and status in ('draft', 'active'));

create policy "personal_sessions: participant read"
  on public.personal_sessions for select
  using (public.is_personal_session_visible(id, (select auth.uid())));

create policy "personal_sessions: creator update incomplete"
  on public.personal_sessions for update
  using (created_by = (select auth.uid()) and status in ('draft', 'active'))
  with check (created_by = (select auth.uid()) and status in ('draft', 'active'));

create policy "personal_session_participants: session visible read"
  on public.personal_session_participants for select
  using (public.is_personal_session_visible(session_id, (select auth.uid())));

create policy "personal_games: session visible read"
  on public.personal_games for select
  using (public.is_personal_session_visible(session_id, (select auth.uid())));

create policy "personal_games: creator insert"
  on public.personal_games for insert
  with check (
    exists (
      select 1 from public.personal_sessions s
       where s.id = session_id
         and s.created_by = (select auth.uid())
         and s.status in ('draft', 'active')
    )
  );

create policy "personal_games: creator update incomplete"
  on public.personal_games for update
  using (
    exists (
      select 1 from public.personal_sessions s
       where s.id = session_id
         and s.created_by = (select auth.uid())
         and s.status in ('draft', 'active')
    )
  )
  with check (
    exists (
      select 1 from public.personal_sessions s
       where s.id = session_id
         and s.created_by = (select auth.uid())
    )
  );

create policy "personal_game_participants: session visible read"
  on public.personal_game_participants for select
  using (
    exists (
      select 1
        from public.personal_games g
       where g.id = game_id
         and public.is_personal_session_visible(g.session_id, (select auth.uid()))
    )
  );

create policy "personal_game_participants: creator insert"
  on public.personal_game_participants for insert
  with check (
    exists (
      select 1
        from public.personal_games g
        join public.personal_sessions s on s.id = g.session_id
       where g.id = game_id
         and s.created_by = (select auth.uid())
         and s.status in ('draft', 'active')
    )
  );

grant execute on function public.add_personal_session_registered_participant(uuid, uuid) to authenticated;
grant execute on function public.add_personal_session_guest_participant(uuid, text, text, text, text) to authenticated;
grant execute on function public.save_personal_game_score(uuid, integer, integer) to authenticated;
grant execute on function public.complete_personal_session(uuid, uuid, text, text) to authenticated;
