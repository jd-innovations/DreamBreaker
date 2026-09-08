-- =============================================================================
-- Community Play — casual round robin / recreational events
-- Migration: 20260616000003_community_play
--
-- Lightweight, account-optional events. Organizers must have an account;
-- participants may join as "unclaimed" guests (no auth) and claim later when
-- they sign up with a matching email.
-- =============================================================================


-- =============================================================================
-- ENUMS
-- =============================================================================

create type play_event_type   as enum ('round_robin', 'mixer', 'ladder', 'open_play', 'kings_court');
create type play_event_status as enum ('open', 'full', 'in_progress', 'completed', 'cancelled');


-- =============================================================================
-- PLAY EVENTS
-- =============================================================================

create table public.play_events (
  id            uuid              primary key default gen_random_uuid(),
  organizer_id  uuid              not null references public.profiles(id) on delete cascade,
  name          text              not null,
  slug          text              unique,
  event_type    play_event_type   not null default 'round_robin',
  venue_name    text,
  location      text              not null,
  city          text,
  state         text,
  event_date    date              not null,
  start_time    time,
  skill_min     numeric(3,2),
  skill_max     numeric(3,2),
  max_players   integer           not null check (max_players > 0 and max_players <= 200),
  format        text,
  notes         text,
  status        play_event_status not null default 'open',
  created_at    timestamptz       not null default now(),
  updated_at    timestamptz       not null default now(),

  constraint check_play_skill_range check (skill_min is null or skill_max is null or skill_min <= skill_max)
);

comment on table public.play_events is 'Casual, account-optional recreational play events (round robin, mixer, etc).';

create index idx_play_events_organizer on public.play_events(organizer_id);
create index idx_play_events_status     on public.play_events(status);
create index idx_play_events_date       on public.play_events(event_date);


-- =============================================================================
-- PLAY PARTICIPANTS
-- "Unclaimed participant profiles" — guests can join without an account.
-- PII (email/phone) is NOT exposed publicly; the play_participants_public view
-- below surfaces only display-safe columns.
-- =============================================================================

create table public.play_participants (
  id                uuid        primary key default gen_random_uuid(),
  event_id          uuid        not null references public.play_events(id) on delete cascade,
  first_name        text        not null,
  last_initial      text,
  email             text        not null,
  phone             text,
  self_rating       text,
  gender            text,
  claimed_by        uuid        references public.profiles(id) on delete set null,
  added_by_organizer boolean    not null default false,
  created_at        timestamptz not null default now(),

  constraint uq_play_participant_email_per_event unique (event_id, email)
);

comment on table public.play_participants is 'Event participants; may be unclaimed guests (claimed_by null) or linked to a profile.';
comment on column public.play_participants.claimed_by is 'Set when a guest signs up / claims their participation via matching email.';

create index idx_play_participants_event   on public.play_participants(event_id);
create index idx_play_participants_email    on public.play_participants(lower(email));
create index idx_play_participants_claimed  on public.play_participants(claimed_by);


-- =============================================================================
-- PLAY MATCHES
-- Singles round robin: each participant plays every other once.
-- =============================================================================

create table public.play_matches (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.play_events(id) on delete cascade,
  round       integer     not null,
  court       integer,
  player_a_id uuid        references public.play_participants(id) on delete cascade,
  player_b_id uuid        references public.play_participants(id) on delete cascade,
  score_a     integer,
  score_b     integer,
  winner      integer     check (winner in (1, 2)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.play_matches is 'Generated round robin matches for a play event.';

create index idx_play_matches_event on public.play_matches(event_id);


-- =============================================================================
-- PUBLIC-SAFE PARTICIPANT VIEW
-- Exposes display-safe columns only (no email/phone). Bypasses RLS by design
-- so the public event page can render the roster without leaking PII.
-- =============================================================================

create view public.play_participants_public as
  select id, event_id, first_name, last_initial, self_rating, gender,
         (claimed_by is not null) as is_claimed, created_at
    from public.play_participants;

grant select on public.play_participants_public to anon, authenticated;


-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- updated_at
create trigger trg_play_events_updated_at
  before update on public.play_events
  for each row execute function public.fn_set_updated_at();

create trigger trg_play_matches_updated_at
  before update on public.play_matches
  for each row execute function public.fn_set_updated_at();


-- Slug auto-generation for play events
create or replace function public.fn_generate_play_event_slug()
returns trigger language plpgsql as $$
declare
  v_base    text;
  v_slug    text;
  v_counter integer := 0;
begin
  if new.slug is not null then
    return new;
  end if;

  v_base := lower(
    regexp_replace(
      unaccent(new.name || ' ' || extract(year from new.event_date)::text),
      '[^a-z0-9]+', '-', 'g'
    )
  );
  v_base := trim(both '-' from v_base);
  v_slug := v_base;

  while exists (select 1 from public.play_events where slug = v_slug) loop
    v_counter := v_counter + 1;
    v_slug := v_base || '-' || v_counter;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

create trigger trg_generate_play_event_slug
  before insert on public.play_events
  for each row execute function public.fn_generate_play_event_slug();


-- Enforce capacity + open status on guest join
create or replace function public.fn_enforce_play_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status play_event_status;
  v_max    integer;
  v_count  integer;
begin
  select status, max_players into v_status, v_max
    from public.play_events where id = new.event_id;

  if v_status is null then
    raise exception 'Play event % not found.', new.event_id using errcode = 'P0001';
  end if;

  if v_status in ('cancelled', 'completed') then
    raise exception 'This event is no longer accepting players.' using errcode = 'P0002';
  end if;

  select count(*) into v_count
    from public.play_participants where event_id = new.event_id;

  if v_count >= v_max then
    raise exception 'This event is full (% players).', v_max using errcode = 'P0003';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_play_capacity
  before insert on public.play_participants
  for each row execute function public.fn_enforce_play_capacity();


-- Auto-flip event to 'full' / back to 'open' as participants change
create or replace function public.fn_sync_play_event_full()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event_id uuid := coalesce(new.event_id, old.event_id);
  v_max      integer;
  v_status   play_event_status;
  v_count    integer;
begin
  select max_players, status into v_max, v_status
    from public.play_events where id = v_event_id;

  -- Only auto-manage between open/full; never override in_progress/completed/cancelled
  if v_status not in ('open', 'full') then
    return coalesce(new, old);
  end if;

  select count(*) into v_count
    from public.play_participants where event_id = v_event_id;

  if v_count >= v_max and v_status = 'open' then
    update public.play_events set status = 'full' where id = v_event_id;
  elsif v_count < v_max and v_status = 'full' then
    update public.play_events set status = 'open' where id = v_event_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_sync_play_event_full
  after insert or delete on public.play_participants
  for each row execute function public.fn_sync_play_event_full();


-- Claim unclaimed participations on signup (email match)
-- Extends the existing new-user handler.
create or replace function public.fn_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, director_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'player'),
    case
      when coalesce((new.raw_user_meta_data->>'role')::user_role, 'player') = 'director'
      then 'pending'::director_status
      else null
    end
  );

  -- Claim any unclaimed Community Play participations with a matching email
  update public.play_participants
     set claimed_by = new.id
   where claimed_by is null
     and lower(email) = lower(new.email);

  return new;
end;
$$;


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.play_events       enable row level security;
alter table public.play_participants enable row level security;
alter table public.play_matches      enable row level security;


-- ── play_events ──────────────────────────────────────────────────────────────
create policy "play_events: public read"
  on public.play_events for select
  using (status <> 'cancelled' or organizer_id = auth.uid() or public.is_admin());

create policy "play_events: organizer insert"
  on public.play_events for insert
  with check (organizer_id = auth.uid());

create policy "play_events: organizer update own"
  on public.play_events for update
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

create policy "play_events: organizer delete own"
  on public.play_events for delete
  using (organizer_id = auth.uid());

create policy "play_events: admin full access"
  on public.play_events for all
  using (public.is_admin());


-- ── play_participants ────────────────────────────────────────────────────────
-- Base-table SELECT is restricted (PII). Public reads go through the view.
create policy "play_participants: organizer + self read"
  on public.play_participants for select
  using (
    claimed_by = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.play_events e
       where e.id = event_id and e.organizer_id = auth.uid()
    )
  );

-- Anyone (including anon guests) may join an open event. Capacity + status are
-- enforced by trigger.
create policy "play_participants: public join"
  on public.play_participants for insert
  with check (
    exists (
      select 1 from public.play_events e
       where e.id = event_id and e.status not in ('cancelled', 'completed')
    )
  );

-- Organizers manage their roster (add/remove).
create policy "play_participants: organizer manage"
  on public.play_participants for all
  using (
    exists (
      select 1 from public.play_events e
       where e.id = event_id and e.organizer_id = auth.uid()
    )
  );

create policy "play_participants: admin full access"
  on public.play_participants for all
  using (public.is_admin());


-- ── play_matches ─────────────────────────────────────────────────────────────
create policy "play_matches: public read"
  on public.play_matches for select
  using (true);

create policy "play_matches: organizer manage"
  on public.play_matches for all
  using (
    exists (
      select 1 from public.play_events e
       where e.id = event_id and e.organizer_id = auth.uid()
    )
  );

create policy "play_matches: admin full access"
  on public.play_matches for all
  using (public.is_admin());
