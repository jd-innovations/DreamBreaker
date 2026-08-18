-- Account deletion support (TODO1.1_EXECUTION_PLAN.md item 1.3).
--
-- Forward-only. Two changes, both required before a real self-service account
-- deletion flow can exist.
--
-- ── 1. profiles.id no longer cascades from auth.users ────────────────────────
--
-- Before this migration, deleting an auth.users row was IMPOSSIBLE for any user
-- with real history. Proven empirically against production:
--
--   DELETE FROM auth.users WHERE id = '<user with registrations + payments>'
--   → ERROR: update or delete on table "profiles" violates foreign key
--     constraint "registrations_player_id_fkey" on table "registrations"
--
-- The chain is: profiles.id REFERENCES auth.users(id) ON DELETE CASCADE, so
-- removing the auth user tried to remove the profile row, which is protected by
-- 4 ON DELETE RESTRICT children and ~19 NO ACTION children that exist precisely
-- to keep financial and bracket history intact:
--
--   RESTRICT   registrations.player_id, transactions.player_id,
--              tournaments.director_id, personal_session_participants.profile_id
--   NO ACTION  payments.payer_user_id, reservations.organizer_id,
--              reservation_players.profile_id, coach_offer_purchases.buyer_id,
--              coach_offer_purchases.coach_id, coach_offers.coach_id,
--              coach_voucher_entitlements.buyer_id/coach_id,
--              bracket_matches.score_entered_by, registrations.checked_in_by,
--              registrations.added_by_director_id, courts.created_by, …
--
-- Dropping this one constraint lets the profiles row survive as an ANONYMIZED
-- TOMBSTONE after the auth user is genuinely deleted. Every constraint above
-- keeps a valid target, so brackets, match history, payment reconciliation, and
-- moderation records are untouched — while the account itself really is gone.
--
-- What this gives up: the database no longer guarantees that every profiles row
-- has a backing auth.users row. Creation is unaffected — profiles are still only
-- ever inserted by the fn_handle_new_user() trigger on auth.users insert — so
-- the only rows that can become orphaned are deliberate deletion tombstones,
-- which is the point. Identify them with deleted_at below.
--
-- ── 2. profiles.deleted_at ───────────────────────────────────────────────────
--
-- Marks a row as a tombstone rather than a live player. Needed because the
-- tombstone keeps a valid, queryable id and would otherwise be indistinguishable
-- from a real user named "Deleted User" in search, discovery, and matchmaking.
-- Also serves as the audit trail for when deletion was carried out.

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set when the user self-deleted their account. The row is an anonymized tombstone retained only so financial, tournament, and moderation foreign keys stay valid. Exclude these rows from search, discovery, matchmaking, and invites.';

-- Partial index: every "live players only" query filters on this, and tombstones
-- are expected to stay a small fraction of the table.
create index if not exists profiles_deleted_at_idx
  on public.profiles (deleted_at)
  where deleted_at is not null;

-- RLS is deliberately unchanged. Deletion runs entirely through the
-- `delete-account` edge function under the service role; no client-side policy
-- grants any new capability here, and nothing below RLS can delete an auth user.
