-- =============================================================================
-- DreamBreaker PB — Initial Supabase Schema
-- Migration: 20260612000001_initial_schema
-- =============================================================================


-- =============================================================================
-- EXTENSIONS
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";       -- fuzzy search on names/cities
create extension if not exists "unaccent";       -- accent-insensitive search
create extension if not exists "postgis";        -- geo distance for matchmaking


-- =============================================================================
-- CUSTOM TYPES (ENUMs)
-- =============================================================================

create type user_role           as enum ('player', 'director', 'admin');
create type director_status     as enum ('pending', 'approved', 'suspended');
create type tournament_status   as enum ('draft', 'pending_approval', 'open', 'filling_fast', 'registration_closed', 'in_progress', 'completed', 'cancelled');
create type tournament_format   as enum ('singles', 'doubles', 'mixed_doubles', 'juniors');
create type bracket_type        as enum ('single_elim', 'double_elim', 'round_robin', 'round_robin_to_single_elim', 'round_robin_to_double_elim');
create type registration_status as enum ('held', 'registered', 'checked_in', 'withdrawn', 'disqualified', 'no_show', 'substitute');
create type match_direction     as enum ('like', 'pass');
create type transaction_type    as enum ('hold', 'entry_balance', 'full_entry', 'refund', 'director_payout', 'platform_fee');
create type transaction_status  as enum ('pending', 'completed', 'failed', 'refunded');
create type round_label         as enum ('pool', 'r64', 'r32', 'r16', 'qf', 'sf', 'bronze', 'final');


-- =============================================================================
-- PROFILES
-- Extends auth.users. One row per authenticated user.
-- =============================================================================

create table public.profiles (
  id                  uuid        primary key references auth.users(id) on delete cascade,
  role                user_role   not null default 'player',
  full_name           text        not null,
  handle              text        unique,
  email               text        not null,
  avatar_url          text,
  location_city       text,
  location_state      text,
  location_coords     geography(point, 4326),  -- for geo-distance matchmaking
  dupr                numeric(4,2) check (dupr >= 2.0 and dupr <= 8.0),
  dupr_verified       boolean     not null default false,
  paddle              text,
  hand                text        check (hand in ('right', 'left', 'ambidextrous')),
  play_style          text,
  availability        text,
  bio                 text,
  stripe_customer_id  text        unique,
  -- Director-specific fields
  director_status     director_status,
  director_approved_at  timestamptz,
  director_approved_by  uuid      references public.profiles(id),
  director_rating     numeric(2,1) check (director_rating >= 0 and director_rating <= 5),
  director_events_hosted integer  not null default 0,
  -- Metadata
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is 'Extends auth.users with app-specific profile data for all roles.';
comment on column public.profiles.location_coords is 'PostGIS point for geo-distance matchmaking queries.';
comment on column public.profiles.dupr_verified is 'True when DUPR has been verified against official DUPR data.';


-- =============================================================================
-- TOURNAMENTS
-- =============================================================================

create table public.tournaments (
  id                    uuid              primary key default gen_random_uuid(),
  director_id           uuid              not null references public.profiles(id) on delete restrict,
  name                  text              not null,
  slug                  text              unique,  -- URL-friendly: "sunset-slam-open-2026"
  venue_name            text,
  venue_address         text,
  city                  text              not null,
  state                 text              not null,
  cover_img_url         text,
  description           text,
  rules                 text,
  -- Event configuration
  format                tournament_format not null,
  bracket_type          bracket_type      not null default 'single_elim',
  skill_min             numeric(3,2),
  skill_max             numeric(3,2),
  draw_size             integer           not null check (draw_size > 0),
  -- Dates
  event_date            date              not null,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,     -- enforced by trigger + RLS
  checkin_opens_at      timestamptz,
  checkin_closes_at     timestamptz,
  -- Financials (stored in cents to avoid floating point)
  entry_fee_cents       integer           not null check (entry_fee_cents >= 0),
  hold_fee_cents        integer           not null check (hold_fee_cents >= 0 and hold_fee_cents <= entry_fee_cents),
  hold_duration_hours   integer           not null default 72,
  prize_pool_cents      integer           check (prize_pool_cents >= 0),
  -- Status
  status                tournament_status not null default 'draft',
  spots_filled          integer           not null default 0,
  -- Admin approval trail
  submitted_for_approval_at timestamptz,
  approved_at           timestamptz,
  approved_by           uuid              references public.profiles(id),
  rejection_reason      text,
  -- Metadata
  created_at            timestamptz       not null default now(),
  updated_at            timestamptz       not null default now(),

  constraint check_skill_range check (skill_min is null or skill_max is null or skill_min <= skill_max),
  constraint check_hold_lte_entry check (hold_fee_cents <= entry_fee_cents),
  constraint check_reg_dates check (registration_opens_at is null or registration_closes_at is null or registration_opens_at < registration_closes_at),
  constraint check_reg_before_event check (registration_closes_at is null or registration_closes_at::date <= event_date)
);

comment on table public.tournaments is 'All tournament events, including drafts and archived completions.';
comment on column public.tournaments.entry_fee_cents is 'Full entry fee in cents (e.g. 6500 = $65.00).';
comment on column public.tournaments.hold_fee_cents is 'Fee charged immediately to hold a spot; deducted from entry_fee_cents at confirmation.';
comment on column public.tournaments.registration_closes_at is 'Hard cutoff enforced by trigger — no new registrations accepted after this timestamp.';
comment on column public.tournaments.spots_filled is 'Denormalised count updated by trigger for fast availability checks.';


-- =============================================================================
-- DIVISIONS
-- A tournament can have multiple divisions (e.g. Men's 4.0, Mixed 3.5).
-- Registrations belong to a division, enforcing the one-division-per-tournament rule.
-- =============================================================================

create table public.divisions (
  id              uuid              primary key default gen_random_uuid(),
  tournament_id   uuid              not null references public.tournaments(id) on delete cascade,
  name            text              not null,  -- "Men's Doubles 4.5", "Mixed 3.5"
  format          tournament_format not null,
  skill_min       numeric(3,2),
  skill_max       numeric(3,2),
  draw_size       integer           not null check (draw_size > 0),
  entry_fee_cents integer,          -- overrides tournament default if set
  spots_filled    integer           not null default 0,
  created_at      timestamptz       not null default now()
);

comment on table public.divisions is 'Sub-divisions within a tournament. Enables Men/Women/Mixed/Juniors splits within one event.';


-- =============================================================================
-- REGISTRATIONS
-- Core business table. One row per player per division.
-- Business rules enforced here:
--   1. One registration per player per tournament (across all divisions).
--   2. Registration closes_at is enforced by trigger.
--   3. Directors can add players manually (director_added = true).
--   4. Directors can replace no-shows with substitutes (status = 'substitute', replaces_registration_id set).
-- =============================================================================

create table public.registrations (
  id                      uuid                primary key default gen_random_uuid(),
  tournament_id           uuid                not null references public.tournaments(id) on delete restrict,
  division_id             uuid                references public.divisions(id) on delete restrict,
  player_id               uuid                not null references public.profiles(id) on delete restrict,
  partner_id              uuid                references public.profiles(id) on delete set null,
  status                  registration_status not null default 'held',
  -- Financial tracking
  hold_fee_paid_cents     integer             not null default 0,
  entry_fee_paid_cents    integer             not null default 0,
  hold_expires_at         timestamptz,
  -- Payment references
  stripe_hold_intent_id   text,
  stripe_entry_intent_id  text,
  -- Director override fields
  director_added          boolean             not null default false,
  added_by_director_id    uuid                references public.profiles(id),
  -- Substitute tracking (director replaces no-show)
  replaces_registration_id uuid               references public.registrations(id),
  -- Check-in
  checked_in_at           timestamptz,
  checked_in_by           uuid                references public.profiles(id),
  -- Waiver
  waiver_accepted_at      timestamptz,
  -- Metadata
  created_at              timestamptz         not null default now(),
  updated_at              timestamptz         not null default now(),

  -- Business rule: one registration per player per tournament (any division)
  constraint uq_one_registration_per_tournament unique (tournament_id, player_id)
);

comment on table public.registrations is 'A player entry in a tournament division. Enforces one-division-per-tournament rule.';
comment on column public.registrations.director_added is 'True when a director manually added this player, bypassing normal registration flow.';
comment on column public.registrations.replaces_registration_id is 'Set when this registration is a substitute for a no-show player.';
comment on column public.registrations.hold_expires_at is 'After this timestamp the held spot is auto-released by a scheduled Supabase Edge Function.';


-- =============================================================================
-- BRACKET MATCHES
-- =============================================================================

create table public.bracket_matches (
  id              uuid        primary key default gen_random_uuid(),
  tournament_id   uuid        not null references public.tournaments(id) on delete cascade,
  division_id     uuid        references public.divisions(id) on delete cascade,
  round           round_label not null,
  match_number    integer     not null,
  -- Team 1
  team1_player_a  uuid        references public.profiles(id) on delete set null,
  team1_player_b  uuid        references public.profiles(id) on delete set null,  -- null for singles
  -- Team 2
  team2_player_a  uuid        references public.profiles(id) on delete set null,
  team2_player_b  uuid        references public.profiles(id) on delete set null,
  -- Scores: array of per-game scores, e.g. ARRAY[11,9,11] means team1 won 11-x, x-11, 11-x
  score_team1     integer[]   default '{}',
  score_team2     integer[]   default '{}',
  winner          integer     check (winner in (1, 2)),  -- 1 or 2
  -- Logistics
  court           text,
  scheduled_at    timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  -- Score entry audit
  score_entered_by  uuid      references public.profiles(id),
  score_entered_at  timestamptz,
  -- Bracket wiring
  next_match_id   uuid        references public.bracket_matches(id),
  next_match_slot integer     check (next_match_slot in (1, 2)),  -- which team slot in the next match
  -- Metadata
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint uq_match_per_round unique (tournament_id, division_id, round, match_number)
);

comment on table public.bracket_matches is 'Individual match nodes in the bracket. next_match_id wires the bracket tree.';
comment on column public.bracket_matches.score_team1 is 'Array of per-game scores. Length = number of games played.';
comment on column public.bracket_matches.next_match_id is 'The match this winner advances to. NULL for the final.';


-- =============================================================================
-- DUPR HISTORY
-- Append-only log. One row per player per tournament completed.
-- =============================================================================

create table public.dupr_history (
  id              uuid        primary key default gen_random_uuid(),
  player_id       uuid        not null references public.profiles(id) on delete cascade,
  tournament_id   uuid        references public.tournaments(id) on delete set null,
  rating_before   numeric(4,2),
  rating_after    numeric(4,2) not null,
  delta           numeric(4,2) generated always as (rating_after - rating_before) stored,
  recorded_at     timestamptz not null default now()
);

comment on table public.dupr_history is 'Append-only DUPR rating log. Used for trend charts and audit.';


-- =============================================================================
-- MATCHMAKING
-- Stores individual swipe decisions. Mutual likes = a match.
-- =============================================================================

create table public.matchmaking_swipes (
  id            uuid            primary key default gen_random_uuid(),
  requester_id  uuid            not null references public.profiles(id) on delete cascade,
  target_id     uuid            not null references public.profiles(id) on delete cascade,
  direction     match_direction not null,
  created_at    timestamptz     not null default now(),

  constraint uq_swipe unique (requester_id, target_id),
  constraint no_self_swipe check (requester_id != target_id)
);

comment on table public.matchmaking_swipes is 'Tinder-style swipe records. Two mutual likes creates a match.';


-- =============================================================================
-- CONVERSATIONS & MESSAGES
-- Only accessible to matched partners (enforced by RLS).
-- =============================================================================

create table public.conversations (
  id              uuid        primary key default gen_random_uuid(),
  participant_a   uuid        not null references public.profiles(id) on delete cascade,
  participant_b   uuid        not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),

  constraint uq_conversation unique (
    least(participant_a, participant_b),
    greatest(participant_a, participant_b)
  ),
  constraint no_self_conversation check (participant_a != participant_b)
);

create table public.messages (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  sender_id       uuid        not null references public.profiles(id) on delete cascade,
  body            text        not null check (length(body) > 0 and length(body) <= 2000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.conversations is 'Messaging threads between matched partners.';
comment on table public.messages is 'Individual chat messages. Body capped at 2000 chars.';


-- =============================================================================
-- TRANSACTIONS
-- Financial audit log. Every money movement gets a row.
-- =============================================================================

create table public.transactions (
  id                  uuid                primary key default gen_random_uuid(),
  registration_id     uuid                references public.registrations(id) on delete set null,
  player_id           uuid                not null references public.profiles(id) on delete restrict,
  tournament_id       uuid                references public.tournaments(id) on delete set null,
  type                transaction_type    not null,
  amount_cents        integer             not null,
  stripe_id           text                unique,
  status              transaction_status  not null default 'pending',
  failure_reason      text,
  created_at          timestamptz         not null default now(),
  updated_at          timestamptz         not null default now()
);

comment on table public.transactions is 'Immutable financial audit log. Every charge, refund, and payout creates a row.';


-- =============================================================================
-- INDEXES
-- =============================================================================

-- Profiles
create index idx_profiles_role            on public.profiles(role);
create index idx_profiles_dupr            on public.profiles(dupr);
create index idx_profiles_location_coords on public.profiles using gist(location_coords);
create index idx_profiles_handle          on public.profiles(handle);

-- Tournaments
create index idx_tournaments_director     on public.tournaments(director_id);
create index idx_tournaments_status       on public.tournaments(status);
create index idx_tournaments_event_date   on public.tournaments(event_date);
create index idx_tournaments_format       on public.tournaments(format);
create index idx_tournaments_city_state   on public.tournaments(city, state);
create index idx_tournaments_skill        on public.tournaments(skill_min, skill_max);
-- Full-text search on tournament name and city
create index idx_tournaments_search       on public.tournaments using gin(
  to_tsvector('english', name || ' ' || city || ' ' || coalesce(state, ''))
);

-- Divisions
create index idx_divisions_tournament     on public.divisions(tournament_id);

-- Registrations
create index idx_registrations_tournament  on public.registrations(tournament_id);
create index idx_registrations_player      on public.registrations(player_id);
create index idx_registrations_partner     on public.registrations(partner_id);
create index idx_registrations_status      on public.registrations(status);
create index idx_registrations_hold_expiry on public.registrations(hold_expires_at)
  where status = 'held';  -- partial index — only active holds matter

-- Bracket matches
create index idx_bracket_tournament        on public.bracket_matches(tournament_id);
create index idx_bracket_division          on public.bracket_matches(division_id);
create index idx_bracket_round             on public.bracket_matches(tournament_id, round);

-- DUPR history
create index idx_dupr_history_player       on public.dupr_history(player_id, recorded_at desc);

-- Matchmaking
create index idx_swipes_requester          on public.matchmaking_swipes(requester_id);
create index idx_swipes_target             on public.matchmaking_swipes(target_id);

-- Conversations
create index idx_conversations_a           on public.conversations(participant_a);
create index idx_conversations_b           on public.conversations(participant_b);
create index idx_conversations_last_msg    on public.conversations(last_message_at desc nulls last);

-- Messages
create index idx_messages_conversation     on public.messages(conversation_id, created_at asc);

-- Transactions
create index idx_transactions_player       on public.transactions(player_id);
create index idx_transactions_tournament   on public.transactions(tournament_id);
create index idx_transactions_registration on public.transactions(registration_id);


-- =============================================================================
-- TRIGGERS — HELPER FUNCTIONS
-- =============================================================================

-- Auto-set updated_at on any table that has it
create or replace function public.fn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at trigger to all relevant tables
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.fn_set_updated_at();

create trigger trg_tournaments_updated_at
  before update on public.tournaments
  for each row execute function public.fn_set_updated_at();

create trigger trg_registrations_updated_at
  before update on public.registrations
  for each row execute function public.fn_set_updated_at();

create trigger trg_bracket_matches_updated_at
  before update on public.bracket_matches
  for each row execute function public.fn_set_updated_at();

create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute function public.fn_set_updated_at();


-- =============================================================================
-- TRIGGER — ENFORCE REGISTRATION CLOSE DATE
-- Blocks any INSERT on registrations where tournament.registration_closes_at
-- has passed. Applies to all inserts, including director_added = true.
-- Exception: substitutes replacing no-shows are allowed after close
-- (business rule: director can swap no-shows on event day).
-- =============================================================================

create or replace function public.fn_enforce_registration_close()
returns trigger language plpgsql security definer as $$
declare
  v_closes_at   timestamptz;
  v_status      tournament_status;
  v_is_sub      boolean;
begin
  select registration_closes_at, status
    into v_closes_at, v_status
    from public.tournaments
   where id = new.tournament_id;

  -- Substitutes may be added even after registration close (on event day)
  v_is_sub := (new.replaces_registration_id is not null);

  if v_status in ('cancelled', 'completed') then
    raise exception 'Tournament % is % — registrations not accepted.', new.tournament_id, v_status
      using errcode = 'P0001';
  end if;

  if not v_is_sub
     and v_closes_at is not null
     and now() > v_closes_at then
    raise exception 'Registration for tournament % closed at %.', new.tournament_id, v_closes_at
      using errcode = 'P0002';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_registration_close
  before insert on public.registrations
  for each row execute function public.fn_enforce_registration_close();


-- =============================================================================
-- TRIGGER — ENFORCE ONE DIVISION PER TOURNAMENT PER PLAYER
-- The unique constraint (tournament_id, player_id) already blocks duplicates,
-- but this trigger provides a clear error message.
-- =============================================================================

create or replace function public.fn_enforce_single_division()
returns trigger language plpgsql as $$
begin
  -- The unique constraint handles the hard block.
  -- This function exists only to produce a readable error for the API layer.
  if exists (
    select 1 from public.registrations
     where tournament_id = new.tournament_id
       and player_id     = new.player_id
       and id            != coalesce(new.id, '00000000-0000-0000-0000-000000000000')
  ) then
    raise exception 'Player % is already registered for tournament %. Players may not enter multiple divisions of the same tournament.',
      new.player_id, new.tournament_id
      using errcode = 'P0003';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_single_division
  before insert on public.registrations
  for each row execute function public.fn_enforce_single_division();


-- =============================================================================
-- TRIGGER — MAINTAIN spots_filled ON tournaments AND divisions
-- Increments / decrements the denormalised count on insert, update (status
-- change), and delete of a registration row.
-- Counted statuses: 'held', 'registered', 'checked_in', 'substitute'
-- Not counted: 'withdrawn', 'disqualified', 'no_show'
-- =============================================================================

create or replace function public.fn_sync_spots_filled()
returns trigger language plpgsql security definer as $$
declare
  v_active_statuses registration_status[] := array['held', 'registered', 'checked_in', 'substitute'];
  v_old_active boolean;
  v_new_active boolean;
begin
  if TG_OP = 'INSERT' then
    if new.status = any(v_active_statuses) then
      update public.tournaments set spots_filled = spots_filled + 1 where id = new.tournament_id;
      if new.division_id is not null then
        update public.divisions set spots_filled = spots_filled + 1 where id = new.division_id;
      end if;
    end if;
    return new;

  elsif TG_OP = 'UPDATE' then
    v_old_active := (old.status = any(v_active_statuses));
    v_new_active := (new.status = any(v_active_statuses));
    if v_old_active and not v_new_active then
      -- Became inactive (withdrawn / disqualified / no_show)
      update public.tournaments set spots_filled = greatest(0, spots_filled - 1) where id = new.tournament_id;
      if new.division_id is not null then
        update public.divisions set spots_filled = greatest(0, spots_filled - 1) where id = new.division_id;
      end if;
    elsif not v_old_active and v_new_active then
      -- Became active (e.g. re-instated)
      update public.tournaments set spots_filled = spots_filled + 1 where id = new.tournament_id;
      if new.division_id is not null then
        update public.divisions set spots_filled = spots_filled + 1 where id = new.division_id;
      end if;
    end if;
    return new;

  elsif TG_OP = 'DELETE' then
    if old.status = any(v_active_statuses) then
      update public.tournaments set spots_filled = greatest(0, spots_filled - 1) where id = old.tournament_id;
      if old.division_id is not null then
        update public.divisions set spots_filled = greatest(0, spots_filled - 1) where id = old.division_id;
      end if;
    end if;
    return old;
  end if;
end;
$$;

create trigger trg_sync_spots_filled
  after insert or update of status or delete on public.registrations
  for each row execute function public.fn_sync_spots_filled();


-- =============================================================================
-- TRIGGER — AUTO-UPDATE tournament.status BASED ON FILL RATE
-- draft → stays draft until director submits for approval
-- open / filling_fast boundary: >= 80% filled triggers 'filling_fast'
-- registration_closed: fires when registration_closes_at passes (via scheduled fn)
-- This trigger handles the fill-rate transitions only.
-- =============================================================================

create or replace function public.fn_auto_tournament_status()
returns trigger language plpgsql security definer as $$
declare
  v_pct numeric;
begin
  -- Only run for tournaments that are publicly visible
  if new.status not in ('open', 'filling_fast') then
    return new;
  end if;

  if new.draw_size > 0 then
    v_pct := (new.spots_filled::numeric / new.draw_size::numeric) * 100;
    if v_pct >= 80 and new.status = 'open' then
      new.status := 'filling_fast';
    elsif v_pct < 80 and new.status = 'filling_fast' then
      new.status := 'open';  -- drops back if a withdrawal frees spots
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_auto_tournament_status
  before update of spots_filled on public.tournaments
  for each row execute function public.fn_auto_tournament_status();


-- =============================================================================
-- TRIGGER — UPDATE conversations.last_message_at
-- =============================================================================

create or replace function public.fn_update_conversation_last_message()
returns trigger language plpgsql as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger trg_update_conversation_last_message
  after insert on public.messages
  for each row execute function public.fn_update_conversation_last_message();


-- =============================================================================
-- TRIGGER — CREATE PROFILE ON AUTH SIGNUP
-- Called by Supabase auth hook (set in Supabase Dashboard: Auth > Hooks).
-- Maps auth.users metadata → profiles row.
-- =============================================================================

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
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();


-- =============================================================================
-- TRIGGER — TOURNAMENT SLUG AUTO-GENERATION
-- Generates a URL-friendly slug from name + year on insert if not provided.
-- =============================================================================

create or replace function public.fn_generate_tournament_slug()
returns trigger language plpgsql as $$
declare
  v_base text;
  v_slug text;
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

  -- Ensure uniqueness
  while exists (select 1 from public.tournaments where slug = v_slug) loop
    v_counter := v_counter + 1;
    v_slug := v_base || '-' || v_counter;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

create trigger trg_generate_tournament_slug
  before insert on public.tournaments
  for each row execute function public.fn_generate_tournament_slug();


-- =============================================================================
-- ROW LEVEL SECURITY — ENABLE
-- =============================================================================

alter table public.profiles           enable row level security;
alter table public.tournaments         enable row level security;
alter table public.divisions           enable row level security;
alter table public.registrations       enable row level security;
alter table public.bracket_matches     enable row level security;
alter table public.dupr_history        enable row level security;
alter table public.matchmaking_swipes  enable row level security;
alter table public.conversations       enable row level security;
alter table public.messages            enable row level security;
alter table public.transactions        enable row level security;


-- =============================================================================
-- HELPER: current user's role (called inside RLS policies)
-- =============================================================================

create or replace function public.current_user_role()
returns user_role language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_approved_director()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role = 'director'
       and director_status = 'approved'
  );
$$;


-- =============================================================================
-- RLS POLICIES — PROFILES
-- =============================================================================

-- Anyone can read any profile (needed for public tournament pages, matchmaking)
create policy "profiles: public read"
  on public.profiles for select
  using (true);

-- Users update only their own profile
create policy "profiles: own update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Role changes must go through admin — prevent self-escalation
    and (role = (select role from public.profiles where id = auth.uid()))
  );

-- Admin can update any profile (including role changes)
create policy "profiles: admin full access"
  on public.profiles for all
  using (public.is_admin());


-- =============================================================================
-- RLS POLICIES — TOURNAMENTS
-- =============================================================================

-- Public can read approved tournaments
create policy "tournaments: public read approved"
  on public.tournaments for select
  using (
    status not in ('draft', 'pending_approval', 'cancelled')
    or director_id = auth.uid()
    or public.is_admin()
  );

-- Approved directors can insert tournaments
create policy "tournaments: director insert"
  on public.tournaments for insert
  with check (
    public.is_approved_director()
    and director_id = auth.uid()
  );

-- Directors can update their own tournaments (not change director_id or approval fields)
create policy "tournaments: director update own"
  on public.tournaments for update
  using (
    director_id = auth.uid()
    and public.is_approved_director()
    and status not in ('in_progress', 'completed', 'cancelled')
  )
  with check (
    director_id = auth.uid()
    -- Cannot self-approve
    and approved_at is null
    and approved_by is null
  );

-- Admin full access
create policy "tournaments: admin full access"
  on public.tournaments for all
  using (public.is_admin());


-- =============================================================================
-- RLS POLICIES — DIVISIONS
-- =============================================================================

create policy "divisions: public read"
  on public.divisions for select
  using (
    exists (
      select 1 from public.tournaments t
       where t.id = tournament_id
         and t.status not in ('draft', 'pending_approval', 'cancelled')
    )
    or public.is_admin()
    or exists (
      select 1 from public.tournaments t
       where t.id = tournament_id and t.director_id = auth.uid()
    )
  );

create policy "divisions: director manage own"
  on public.divisions for all
  using (
    exists (
      select 1 from public.tournaments t
       where t.id = tournament_id and t.director_id = auth.uid()
    )
    and public.is_approved_director()
  );

create policy "divisions: admin full access"
  on public.divisions for all
  using (public.is_admin());


-- =============================================================================
-- RLS POLICIES — REGISTRATIONS
-- =============================================================================

-- Players see their own registrations
create policy "registrations: player read own"
  on public.registrations for select
  using (
    player_id = auth.uid()
    or partner_id = auth.uid()
  );

-- Directors see all registrations for their tournaments
create policy "registrations: director read own tournament"
  on public.registrations for select
  using (
    exists (
      select 1 from public.tournaments t
       where t.id = tournament_id and t.director_id = auth.uid()
    )
  );

-- Players insert their own registrations (close-date checked by trigger)
create policy "registrations: player insert own"
  on public.registrations for insert
  with check (
    player_id = auth.uid()
    and director_added = false
  );

-- Directors insert registrations for their tournaments (director_added must be true)
create policy "registrations: director insert manual"
  on public.registrations for insert
  with check (
    public.is_approved_director()
    and director_added = true
    and added_by_director_id = auth.uid()
    and exists (
      select 1 from public.tournaments t
       where t.id = tournament_id and t.director_id = auth.uid()
    )
  );

-- Players can update only their own registration status (withdraw / accept waiver)
create policy "registrations: player update own"
  on public.registrations for update
  using (player_id = auth.uid())
  with check (
    player_id = auth.uid()
    -- Players may only withdraw or accept waiver; no other field changes
    and (
      status = 'withdrawn'
      or waiver_accepted_at is not null
    )
  );

-- Directors manage registrations for their tournaments (check-in, no-show, substitute)
create policy "registrations: director update own tournament"
  on public.registrations for update
  using (
    exists (
      select 1 from public.tournaments t
       where t.id = tournament_id and t.director_id = auth.uid()
    )
    and public.is_approved_director()
  );

-- Admin full access
create policy "registrations: admin full access"
  on public.registrations for all
  using (public.is_admin());


-- =============================================================================
-- RLS POLICIES — BRACKET MATCHES
-- =============================================================================

-- Public read for any non-draft tournament
create policy "bracket_matches: public read"
  on public.bracket_matches for select
  using (
    exists (
      select 1 from public.tournaments t
       where t.id = tournament_id
         and t.status not in ('draft', 'pending_approval')
    )
  );

-- Directors enter/update scores for their tournaments
create policy "bracket_matches: director manage own"
  on public.bracket_matches for all
  using (
    exists (
      select 1 from public.tournaments t
       where t.id = tournament_id and t.director_id = auth.uid()
    )
    and public.is_approved_director()
  );

create policy "bracket_matches: admin full access"
  on public.bracket_matches for all
  using (public.is_admin());


-- =============================================================================
-- RLS POLICIES — DUPR HISTORY
-- =============================================================================

create policy "dupr_history: player read own"
  on public.dupr_history for select
  using (player_id = auth.uid());

create policy "dupr_history: public read"
  on public.dupr_history for select
  using (true);  -- DUPR is public information

-- Only service role (triggers / Edge Functions) inserts; no direct user insert
create policy "dupr_history: service insert only"
  on public.dupr_history for insert
  using (public.is_admin());


-- =============================================================================
-- RLS POLICIES — MATCHMAKING SWIPES
-- =============================================================================

-- Users see only their own swipes
create policy "swipes: own read"
  on public.matchmaking_swipes for select
  using (requester_id = auth.uid());

create policy "swipes: own insert"
  on public.matchmaking_swipes for insert
  with check (requester_id = auth.uid());

-- No updates allowed — swipes are immutable (undo handled at app layer by delete)
create policy "swipes: own delete"
  on public.matchmaking_swipes for delete
  using (requester_id = auth.uid());

create policy "swipes: admin read"
  on public.matchmaking_swipes for select
  using (public.is_admin());


-- =============================================================================
-- RLS POLICIES — CONVERSATIONS & MESSAGES
-- =============================================================================

-- Conversation visible only to its two participants
create policy "conversations: participants read"
  on public.conversations for select
  using (participant_a = auth.uid() or participant_b = auth.uid());

-- Only create a conversation if a mutual match exists
create policy "conversations: participants insert if matched"
  on public.conversations for insert
  with check (
    (participant_a = auth.uid() or participant_b = auth.uid())
    and exists (
      select 1 from public.matchmaking_swipes s1
      join public.matchmaking_swipes s2
        on s1.requester_id = s2.target_id
       and s1.target_id    = s2.requester_id
      where s1.direction = 'like'
        and s2.direction = 'like'
        and s1.requester_id in (participant_a, participant_b)
        and s1.target_id    in (participant_a, participant_b)
    )
  );

create policy "messages: participants read"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

create policy "messages: participant send"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

create policy "messages: admin read"
  on public.messages for select
  using (public.is_admin());


-- =============================================================================
-- RLS POLICIES — TRANSACTIONS
-- =============================================================================

create policy "transactions: player read own"
  on public.transactions for select
  using (player_id = auth.uid());

-- Directors read transactions for their tournaments
create policy "transactions: director read own tournament"
  on public.transactions for select
  using (
    exists (
      select 1 from public.tournaments t
       where t.id = tournament_id and t.director_id = auth.uid()
    )
  );

-- Transactions are only written by service role (Stripe webhook handler)
create policy "transactions: admin full access"
  on public.transactions for all
  using (public.is_admin());


-- =============================================================================
-- VIEWS
-- =============================================================================

-- Mutual matches view: returns pairs of matched users cleanly
create or replace view public.v_mutual_matches as
select
  s1.requester_id  as player_a,
  s1.target_id     as player_b,
  greatest(s1.created_at, s2.created_at) as matched_at
from public.matchmaking_swipes s1
join public.matchmaking_swipes s2
  on s1.requester_id = s2.target_id
 and s1.target_id    = s2.requester_id
where s1.direction = 'like'
  and s2.direction = 'like'
  and s1.requester_id < s1.target_id;  -- deduplicate pairs

comment on view public.v_mutual_matches is 'Deduplicated list of mutual matchmaking matches (both players liked each other).';


-- Tournament public listing view: enriched with director name, fill %
create or replace view public.v_tournament_listing as
select
  t.id,
  t.name,
  t.slug,
  t.city,
  t.state,
  t.venue_name,
  t.cover_img_url,
  t.format,
  t.bracket_type,
  t.skill_min,
  t.skill_max,
  t.draw_size,
  t.spots_filled,
  t.draw_size - t.spots_filled          as spots_remaining,
  round((t.spots_filled::numeric / nullif(t.draw_size, 0)) * 100, 1) as fill_pct,
  t.entry_fee_cents,
  t.hold_fee_cents,
  t.prize_pool_cents,
  t.event_date,
  t.registration_closes_at,
  t.status,
  t.event_date < current_date          as is_past,
  p.full_name                           as director_name,
  p.director_rating
from public.tournaments t
join public.profiles p on p.id = t.director_id
where t.status not in ('draft', 'pending_approval', 'cancelled');

comment on view public.v_tournament_listing is 'Public-safe tournament listing with fill percentage and director name. Excludes drafts.';


-- Director earnings summary view
create or replace view public.v_director_earnings as
select
  t.director_id,
  t.id          as tournament_id,
  t.name        as tournament_name,
  t.event_date,
  count(r.id) filter (where r.status in ('registered', 'checked_in', 'substitute')) as confirmed_registrations,
  sum(r.entry_fee_paid_cents) filter (where r.status in ('registered', 'checked_in', 'substitute')) as gross_entry_cents,
  sum(r.hold_fee_paid_cents)  as gross_hold_cents,
  -- Platform fee: 12% of entry fees
  round(sum(r.entry_fee_paid_cents) filter (where r.status in ('registered', 'checked_in', 'substitute')) * 0.12) as platform_fee_cents,
  -- Director payout: 88% of entry fees + all hold fees
  round(sum(r.entry_fee_paid_cents) filter (where r.status in ('registered', 'checked_in', 'substitute')) * 0.88)
    + coalesce(sum(r.hold_fee_paid_cents), 0)  as director_payout_cents
from public.tournaments t
left join public.registrations r on r.tournament_id = t.id
group by t.director_id, t.id, t.name, t.event_date;

comment on view public.v_director_earnings is 'Per-tournament earnings breakdown for directors. Platform fee = 12% of confirmed entry fees.';


-- =============================================================================
-- STORAGE BUCKETS (run via Supabase Dashboard or supabase/config.toml)
-- Documented here for reference — not executable SQL.
--
-- bucket: tournament-covers  (public, 5MB max, image/* only)
-- bucket: player-avatars     (public, 2MB max, image/* only)
-- =============================================================================


-- =============================================================================
-- REALTIME PUBLICATIONS
-- Enable Supabase Realtime on tables needed for live updates.
-- =============================================================================

-- bracket_matches: live score updates pushed to spectators
alter publication supabase_realtime add table public.bracket_matches;

-- messages: real-time chat delivery
alter publication supabase_realtime add table public.messages;

-- registrations: live spot-count updates on tournament detail page
alter publication supabase_realtime add table public.registrations;


-- =============================================================================
-- SCHEDULED / EDGE FUNCTION NOTES
-- These cannot be expressed in SQL but are documented here for implementation.
--
-- fn_expire_holds (cron: every 15 minutes)
--   Update registrations set status = 'withdrawn'
--   where status = 'held' and hold_expires_at < now()
--   — triggers fn_sync_spots_filled to decrement count automatically.
--
-- fn_close_registration (cron: every 5 minutes)
--   Update tournaments set status = 'registration_closed'
--   where status in ('open', 'filling_fast')
--   and registration_closes_at < now()
--   and status != 'registration_closed'
--
-- fn_update_dupr_post_event (triggered by tournament status → 'completed')
--   Inserts dupr_history rows and updates profiles.dupr for all participants.
-- =============================================================================


-- =============================================================================
-- SEED DATA — USER ROLES (for Supabase service-role seeding only)
-- =============================================================================

-- Roles are enforced at the application layer via the user_role enum and RLS.
-- No separate Postgres roles are created — Supabase uses a single authenticated
-- role with RLS acting as the security boundary between player/director/admin.
-- The service_role key (server-side only) bypasses RLS for admin operations.
