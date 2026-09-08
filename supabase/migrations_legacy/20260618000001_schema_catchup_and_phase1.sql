-- =============================================================================
-- DreamBreaker PB — Phase 1: Schema catch-up + director dual-role + messaging
-- Migration: 20260618000001_schema_catchup_and_phase1
--
-- This migration does three things:
--   1. Documents schema drift — columns added directly in the Supabase dashboard
--      after the initial migration. All use ADD COLUMN IF NOT EXISTS so the
--      migration is idempotent against the live database.
--   2. Adds Phase 1 new columns: is_director, Stripe Connect, converted_at.
--   3. Fixes the conversations RLS so directors can DM their registrants,
--      hold-spot users, and waitlist users without a matchmaking swipe.
-- =============================================================================


-- =============================================================================
-- PART 1 — SCHEMA CATCH-UP (idempotent; documents existing live columns)
-- =============================================================================

-- ── profiles ─────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists skill_level               text,
  add column if not exists cover_url                 text,
  add column if not exists is_discoverable           boolean     not null default true,
  add column if not exists looking_status            text        not null default 'open',
  add column if not exists notif_hold_expiry         boolean     not null default true,
  add column if not exists notif_liked_you           boolean     not null default true,
  add column if not exists notif_new_match           boolean     not null default true,
  add column if not exists notif_tournaments         boolean     not null default true;


-- ── tournaments ───────────────────────────────────────────────────────────────
-- Note: both rejected_reason and rejection_reason exist in the live DB.
--   rejection_reason  — in the initial migration
--   rejected_reason   — added later; used by the admin UI
-- We keep both for now to avoid breaking existing queries.

alter table public.tournaments
  add column if not exists featured              boolean      not null default false,
  add column if not exists formats               text[],
  add column if not exists tournament_format     text,          -- legacy/redundant; keep for compat
  add column if not exists cancellation_policy   text,
  add column if not exists zip_code              text,
  add column if not exists hold_cutoff_days      integer      not null default 14,
  add column if not exists pool_count            integer,
  add column if not exists rejected_reason       text;          -- duplicate of rejection_reason; both kept


-- ── registrations ─────────────────────────────────────────────────────────────
-- Waitlist: tracked via waitlist_position (integer) + status = 'held'.
-- No separate 'waitlist' status enum value exists.

alter table public.registrations
  add column if not exists needs_partner             boolean     not null default false,
  add column if not exists waitlist_position         integer,
  add column if not exists waitlist_offer_expires_at timestamptz,
  add column if not exists hold_expired_at           timestamptz;

-- Index for efficient waitlist queue management (advance on spot open)
create index if not exists idx_registrations_waitlist
  on public.registrations(tournament_id, waitlist_position)
  where waitlist_position is not null;


-- ── divisions ─────────────────────────────────────────────────────────────────

alter table public.divisions
  add column if not exists gender_category text;


-- =============================================================================
-- PART 2 — PHASE 1 NEW COLUMNS
-- =============================================================================

-- ── profiles: director dual-role + Stripe Connect ────────────────────────────
--
-- is_director separates the director capability from the user_role enum.
-- A user keeps role = 'player' in the enum but gains director features when
-- is_director = true + director_status = 'approved'.
-- Existing directors (role = 'director') are backfilled below.
--
-- stripe_connect_account_id: the Stripe Connect account for director payouts.
-- stripe_connect_onboarded_at: set when onboarding is complete; gates publishing
--   paid tournaments.

alter table public.profiles
  add column if not exists is_director                 boolean     not null default false,
  add column if not exists stripe_connect_account_id   text        unique,
  add column if not exists stripe_connect_onboarded_at timestamptz;

-- Backfill: existing directors (role = 'director') gain is_director = true.
update public.profiles
   set is_director = true
 where role = 'director'
   and is_director = false;


-- ── registrations: hold conversion timestamp ─────────────────────────────────
-- Set when a registration transitions from status = 'held' to 'registered'.

alter table public.registrations
  add column if not exists converted_at timestamptz;


-- =============================================================================
-- PART 3 — UPDATE HELPER FUNCTIONS
-- =============================================================================

-- is_approved_director: now checks is_director flag OR legacy role = 'director'.
-- Both paths are supported during the transition period.
create or replace function public.is_approved_director()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (role = 'director' or is_director = true)
       and director_status = 'approved'
  );
$$;

-- fn_handle_new_user: set is_director = true on signup if role = 'director'.
create or replace function public.fn_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role        user_role;
  v_is_director boolean;
begin
  v_role        := coalesce((new.raw_user_meta_data->>'role')::user_role, 'player');
  v_is_director := (v_role = 'director');

  insert into public.profiles (id, email, full_name, role, is_director, director_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role,
    v_is_director,
    case when v_is_director then 'pending'::director_status else null end
  );

  -- Claim any community play participants registered under this email
  update public.play_participants
     set claimed_by = new.id
   where lower(email) = lower(new.email)
     and claimed_by is null;

  return new;
end;
$$;


-- =============================================================================
-- PART 4 — FIX CONVERSATIONS RLS FOR DIRECTOR ↔ REGISTRANT MESSAGING
-- =============================================================================
-- The original policy required a mutual matchmaking swipe to exist before
-- creating a conversation. This locked out directors from messaging their own
-- registrants, hold-spot users, and waitlist users.
--
-- New policy allows a conversation if ANY of:
--   (a) A mutual Partner Finder match exists (original behaviour — preserved).
--   (b) The initiating user is an approved director AND the other participant
--       has an active registration (held / registered / checked_in) in one of
--       that director's tournaments.
--   (c) The initiating user is a player AND the other participant is the
--       director of a tournament the player has an active registration in.
--       (Player-initiated "contact director" CTA on tournament page.)
-- =============================================================================

drop policy if exists "conversations: participants insert if matched" on public.conversations;

create policy "conversations: participants insert"
  on public.conversations for insert
  with check (
    -- Current user must be one of the two participants
    (participant_a = (select auth.uid()) or participant_b = (select auth.uid()))

    and (

      -- (a) Mutual Partner Finder match
      exists (
        select 1
          from public.matchmaking_swipes s1
          join public.matchmaking_swipes s2
            on s1.requester_id = s2.target_id
           and s1.target_id    = s2.requester_id
           and s2.direction    = 'like'
         where s1.direction    = 'like'
           and s1.requester_id in (participant_a, participant_b)
           and s1.target_id    in (participant_a, participant_b)
      )

      -- (b) Approved director messaging one of their own registrants
      or exists (
        select 1
          from public.profiles      dir
          join public.tournaments    t   on t.director_id    = dir.id
          join public.registrations  r   on r.tournament_id  = t.id
         where dir.id = (select auth.uid())
           and (dir.role = 'director' or dir.is_director = true)
           and dir.director_status = 'approved'
           -- the other participant is the registrant
           and r.player_id in (participant_a, participant_b)
           and r.player_id != (select auth.uid())
           and r.status    in ('held', 'registered', 'checked_in')
      )

      -- (c) Player initiating contact with the director of their tournament
      or exists (
        select 1
          from public.registrations  r
          join public.tournaments    t   on t.id          = r.tournament_id
         where r.player_id      = (select auth.uid())
           and r.status         in ('held', 'registered', 'checked_in')
           -- the other participant is that tournament's director
           and t.director_id    in (participant_a, participant_b)
           and t.director_id    != (select auth.uid())
      )

    )
  );

comment on policy "conversations: participants insert" on public.conversations is
  'Allows conversation creation for: (a) mutual Partner Finder matches, (b) directors DMing registrants/hold/waitlist users, (c) players initiating contact with their tournament director.';
