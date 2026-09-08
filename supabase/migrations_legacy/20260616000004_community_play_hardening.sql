-- =============================================================================
-- Community Play — advisor hardening
-- Migration: 20260616000004_community_play_hardening
--
-- Addresses Supabase advisor findings for the play_* objects:
--  - SECURITY: fn_generate_play_event_slug had a mutable search_path
--  - PERFORMANCE: RLS policies re-evaluated auth.uid()/is_admin() per row;
--    wrap in scalar subqueries so they evaluate once per statement
--  - PERFORMANCE: add covering indexes for play_matches participant FKs
-- =============================================================================


-- ── Pin search_path on the slug function ─────────────────────────────────────
create or replace function public.fn_generate_play_event_slug()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_base    text;
  v_slug    text;
  v_counter integer := 0;
begin
  if new.slug is not null then
    return new;
  end if;
  v_base := lower(regexp_replace(unaccent(new.name || ' ' || extract(year from new.event_date)::text), '[^a-z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  v_slug := v_base;
  while exists (select 1 from public.play_events where slug = v_slug) loop
    v_counter := v_counter + 1;
    v_slug := v_base || '-' || v_counter;
  end loop;
  new.slug := v_slug;
  return new;
end;
$$;


-- ── Covering indexes for play_matches participant FKs ────────────────────────
create index if not exists idx_play_matches_player_a on public.play_matches(player_a_id);
create index if not exists idx_play_matches_player_b on public.play_matches(player_b_id);


-- ── Optimize RLS policies: evaluate auth.uid()/is_admin() once per statement ──

-- play_events
drop policy if exists "play_events: public read" on public.play_events;
create policy "play_events: public read"
  on public.play_events for select
  using (status <> 'cancelled' or organizer_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "play_events: organizer insert" on public.play_events;
create policy "play_events: organizer insert"
  on public.play_events for insert
  with check (organizer_id = (select auth.uid()));

drop policy if exists "play_events: organizer update own" on public.play_events;
create policy "play_events: organizer update own"
  on public.play_events for update
  using (organizer_id = (select auth.uid()))
  with check (organizer_id = (select auth.uid()));

drop policy if exists "play_events: organizer delete own" on public.play_events;
create policy "play_events: organizer delete own"
  on public.play_events for delete
  using (organizer_id = (select auth.uid()));

-- play_participants
drop policy if exists "play_participants: organizer + self read" on public.play_participants;
create policy "play_participants: organizer + self read"
  on public.play_participants for select
  using (
    claimed_by = (select auth.uid())
    or (select public.is_admin())
    or exists (select 1 from public.play_events e where e.id = event_id and e.organizer_id = (select auth.uid()))
  );

drop policy if exists "play_participants: organizer manage" on public.play_participants;
create policy "play_participants: organizer manage"
  on public.play_participants for all
  using (
    exists (select 1 from public.play_events e where e.id = event_id and e.organizer_id = (select auth.uid()))
  );

-- play_matches
drop policy if exists "play_matches: organizer manage" on public.play_matches;
create policy "play_matches: organizer manage"
  on public.play_matches for all
  using (
    exists (select 1 from public.play_events e where e.id = event_id and e.organizer_id = (select auth.uid()))
  );
