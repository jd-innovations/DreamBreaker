-- saved_play_events: player bookmarks for Community Play events, mirroring
-- tournament_bookmarks (same shape, same RLS pattern) so both event types
-- support the same save/unsave UX.
create table if not exists public.saved_play_events (
  id           uuid        primary key default gen_random_uuid(),
  player_id    uuid        not null references public.profiles(id) on delete cascade,
  play_event_id uuid       not null references public.play_events(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (player_id, play_event_id)
);

alter table public.saved_play_events enable row level security;

create policy "owner_manage_saved_play_events" on public.saved_play_events
  for all using (auth.uid() = player_id) with check (auth.uid() = player_id);
