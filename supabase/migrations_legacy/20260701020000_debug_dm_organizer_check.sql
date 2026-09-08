-- TEMP DEBUG — diagnose why the "message play_event organizer" RLS clause
-- rejects a real session. security invoker (default) so it evaluates under
-- the SAME role/RLS context as the actual conversations insert. Drop once
-- the issue is confirmed fixed.
create or replace function public.debug_dm_organizer_check(target_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'auth_uid', auth.uid(),
    'target', target_id,
    'clause5_match', exists (
      select 1 from public.play_events pe
       where pe.organizer_id in (auth.uid(), target_id)
         and pe.organizer_id <> auth.uid()
    ),
    'play_events_with_target_as_organizer', (
      select count(*) from public.play_events where organizer_id = target_id
    ),
    'play_events_with_target_as_organizer_open', (
      select count(*) from public.play_events where organizer_id = target_id and status <> 'cancelled'
    )
  );
$$;

grant execute on function public.debug_dm_organizer_check to authenticated;
