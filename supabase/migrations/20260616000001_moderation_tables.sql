-- =============================================================================
-- DreamBreaker PB — Messaging Moderation
-- Migration: 20260616000001_moderation_tables
-- =============================================================================


-- =============================================================================
-- ENUMS
-- =============================================================================

create type report_reason as enum (
  'spam_or_inappropriate',
  'harassment',
  'hate_speech',
  'impersonation',
  'other'
);

create type report_status as enum (
  'pending',
  'reviewed',
  'actioned',
  'dismissed'
);


-- =============================================================================
-- USER_REPORTS
-- Players/directors can flag a conversation participant for review.
-- Admins triage these in the admin portal.
-- =============================================================================

create table public.user_reports (
  id               uuid          primary key default uuid_generate_v4(),
  reporter_id      uuid          not null references public.profiles(id) on delete cascade,
  reported_id      uuid          not null references public.profiles(id) on delete cascade,
  conversation_id  uuid          references public.conversations(id) on delete set null,
  reason           report_reason not null default 'spam_or_inappropriate',
  notes            text,
  status           report_status not null default 'pending',
  reviewed_by      uuid          references public.profiles(id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz   not null default now(),

  -- one open report per reporter/reported pair is enough
  constraint unique_open_report unique (reporter_id, reported_id)
);

-- Admins see all; reporters see their own
alter table public.user_reports enable row level security;

create policy "reporters can insert own reports"
  on public.user_reports for insert
  with check (reporter_id = auth.uid());

create policy "reporters can view own reports"
  on public.user_reports for select
  using (reporter_id = auth.uid());

create policy "admins can manage all reports"
  on public.user_reports for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Index for admin queue (sort by pending first)
create index idx_user_reports_status   on public.user_reports (status, created_at desc);
create index idx_user_reports_reported on public.user_reports (reported_id);


-- =============================================================================
-- BLOCKED_USERS
-- Bidirectional mute: blocker never sees blocked in matches or messages.
-- =============================================================================

create table public.blocked_users (
  id          uuid        primary key default uuid_generate_v4(),
  blocker_id  uuid        not null references public.profiles(id) on delete cascade,
  blocked_id  uuid        not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),

  constraint no_self_block check (blocker_id <> blocked_id),
  constraint unique_block   unique (blocker_id, blocked_id)
);

alter table public.blocked_users enable row level security;

-- Users manage only their own blocks
create policy "users can insert own blocks"
  on public.blocked_users for insert
  with check (blocker_id = auth.uid());

create policy "users can view own blocks"
  on public.blocked_users for select
  using (blocker_id = auth.uid());

create policy "users can delete own blocks"
  on public.blocked_users for delete
  using (blocker_id = auth.uid());

create index idx_blocked_users_blocker on public.blocked_users (blocker_id);
create index idx_blocked_users_blocked on public.blocked_users (blocked_id);


-- =============================================================================
-- PATCH v_mutual_matches TO EXCLUDE BLOCKED USERS
-- Blocked users never appear in each other's match feeds.
-- =============================================================================

drop view if exists public.v_mutual_matches;

create or replace view public.v_mutual_matches as
select
  a.requester_id  as user_a,
  a.target_id     as user_b,
  greatest(a.created_at, b.created_at) as matched_at
from public.matchmaking_swipes a
join public.matchmaking_swipes b
  on  b.requester_id = a.target_id
  and b.target_id    = a.requester_id
  and b.direction    = 'like'
where a.direction = 'like'
  -- exclude any pair where either party has blocked the other
  and not exists (
    select 1 from public.blocked_users bl
    where (bl.blocker_id = a.requester_id and bl.blocked_id = a.target_id)
       or (bl.blocker_id = a.target_id    and bl.blocked_id = a.requester_id)
  );
