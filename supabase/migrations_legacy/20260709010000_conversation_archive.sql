-- =============================================================================
-- Archive conversations — separate state from hidden_at (Delete)
--
-- Delete (hidden_at) has no way back; Archive is recoverable via the
-- Archived tab. Archived threads are excluded from the unread badge count
-- (same treatment as muted) but do not auto-resurface on a new message.
-- =============================================================================

alter table public.conversation_participant_settings
  add column if not exists archived_at timestamptz;
