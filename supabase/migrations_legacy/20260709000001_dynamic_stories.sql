-- =============================================================================
-- Dynamic Stories v0.1 — schema
--
-- System-generated "Live Story Cards" surfaced in Messenger, built from real
-- tournament/game/partner activity. Rows are shared (not per-user) — the
-- generator (20260709000002) creates one row per tournament/game/skill-band,
-- and each viewer's client ranks/filters/marks-viewed independently via
-- story_views. See docs/plans (Dynamic Stories v0.1) for full design context.
-- =============================================================================

create table if not exists public.dynamic_stories (
  id              uuid primary key default gen_random_uuid(),
  story_type      text not null check (story_type in (
                    'tournament', 'game', 'partner', 'court_placeholder', 'marketplace_placeholder'
                  )),
  title           text not null,
  subtitle        text,
  slides          jsonb not null,
  cta_label       text,
  cta_route       text,
  source_type     text,
  source_id       uuid,
  priority_score  numeric not null default 0,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

comment on table public.dynamic_stories is 'System-generated story cards (Dynamic Stories v0.1) — shared rows, not user-owned. Only generate_dynamic_stories() writes to this table.';

create index if not exists idx_dynamic_stories_type_expires
  on public.dynamic_stories(story_type, expires_at);

create unique index if not exists uq_dynamic_stories_source
  on public.dynamic_stories(source_type, source_id)
  where source_type is not null and source_id is not null;

alter table public.dynamic_stories enable row level security;

drop policy if exists "dynamic_stories: authenticated read" on public.dynamic_stories;
create policy "dynamic_stories: authenticated read"
  on public.dynamic_stories for select
  to authenticated
  using (true);

create table if not exists public.story_views (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null references public.dynamic_stories(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  viewed_at   timestamptz not null default now(),

  unique (story_id, user_id)
);

alter table public.story_views enable row level security;

drop policy if exists "story_views: self read" on public.story_views;
create policy "story_views: self read"
  on public.story_views for select
  using (user_id = (select auth.uid()));

drop policy if exists "story_views: self insert" on public.story_views;
create policy "story_views: self insert"
  on public.story_views for insert
  with check (user_id = (select auth.uid()));

create index if not exists idx_story_views_user on public.story_views(user_id);
