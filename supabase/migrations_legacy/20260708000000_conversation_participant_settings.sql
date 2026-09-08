-- =============================================================================
-- Per-user conversation settings: mute + inbox-hide (swipe actions)
--
-- Deliberately NOT keyed off conversation_participants: that table is only
-- reliably populated for contextual (group/play_event/tournament) rows and
-- for direct conversations that existed at the 2026-06-30 backfill.
-- get_or_create_direct_conversation (20260701070000) creates new direct
-- conversations via participant_a/participant_b only, with no matching
-- conversation_participants insert, so new DMs would silently have no
-- membership row to hang settings off of. A standalone table keyed by
-- (conversation_id, user_id) works for every conversation_type without
-- depending on that other table being complete.
-- =============================================================================

create table if not exists public.conversation_participant_settings (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  muted_until     timestamptz,
  hidden_at       timestamptz,
  updated_at      timestamptz not null default now(),

  primary key (conversation_id, user_id)
);

comment on table public.conversation_participant_settings is
  'Per-user mute/hide state for a conversation. hidden_at removes the thread from that user''s own inbox only; the shared conversation/messages rows are untouched for other participants.';

alter table public.conversation_participant_settings enable row level security;

drop policy if exists "conversation_participant_settings: self read" on public.conversation_participant_settings;
create policy "conversation_participant_settings: self read"
  on public.conversation_participant_settings for select
  using (user_id = (select auth.uid()));

drop policy if exists "conversation_participant_settings: self upsert" on public.conversation_participant_settings;
create policy "conversation_participant_settings: self upsert"
  on public.conversation_participant_settings for insert
  with check (
    user_id = (select auth.uid())
    and public.is_conversation_participant(conversation_id, (select auth.uid()))
  );

drop policy if exists "conversation_participant_settings: self update" on public.conversation_participant_settings;
create policy "conversation_participant_settings: self update"
  on public.conversation_participant_settings for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index if not exists idx_conversation_participant_settings_user
  on public.conversation_participant_settings(user_id);
