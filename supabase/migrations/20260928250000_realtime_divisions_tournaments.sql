-- Web Day Of (DIRECTOR_HUB_WEB_PARITY.md, W1) subscribes to bracket_matches,
-- divisions and tournaments so both apps stay in step. Only bracket_matches was
-- in the realtime publication, so a division paused on mobile, or a court list
-- edited there, didn't reach an open web Day Of until the next match changed.
--
-- Both tables are already readable by the people who would receive the events
-- (public read on published tournaments and their divisions); Realtime applies
-- each subscriber's RLS to postgres_changes, so nothing new becomes visible.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'divisions') then
    alter publication supabase_realtime add table public.divisions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tournaments') then
    alter publication supabase_realtime add table public.tournaments;
  end if;
end $$;
