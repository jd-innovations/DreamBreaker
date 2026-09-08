-- Tighten "public join" insert policy: it was unrestricted enough that any
-- authenticated (or anon) caller could set added_by_organizer=true or claim a
-- row on behalf of a different user id — the exact "manual add" path that
-- should be organizer/director-only. Self-join (added_by_organizer=false,
-- claimed_by null or your own id) is unaffected; organizer manual adds still
-- go through the separate "organizer manage" policy which checks organizer_id.
drop policy if exists "play_participants: public join" on public.play_participants;
create policy "play_participants: public join"
  on public.play_participants for insert
  with check (
    exists (
      select 1 from public.play_events e
       where e.id = event_id and e.status not in ('cancelled', 'completed')
    )
    and coalesce(added_by_organizer, false) = false
    and (claimed_by is null or claimed_by = (select auth.uid()))
  );
