-- [RECONSTRUCTED 2026-07-24 from deployed production history — supabase_migrations.schema_migrations
--  version 20260705173944. This migration was applied to production but its file was missing
--  from the local repo. Restored verbatim from the deployed statements. Superseded by
--  20260705174156_drop_saved_events_superseded_by_tournament_bookmarks.sql. Do not edit.]

-- saved_events: user bookmarks for tournaments and community play_events.
-- item_type distinguishes which table item_id points into (no FK — two
-- possible parent tables), enforced at the application layer.
create table if not exists public.saved_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  item_type  text        not null check (item_type in ('tournament', 'play_event')),
  item_id    uuid        not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

alter table public.saved_events enable row level security;

create policy "owner_manage_saved_events" on public.saved_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
