-- Add optional cover photo URL to play_events.
-- Photos are uploaded to the tournament-covers storage bucket.

alter table public.play_events
  add column if not exists cover_url text null;
