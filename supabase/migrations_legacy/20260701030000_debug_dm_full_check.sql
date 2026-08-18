-- TEMP DEBUG — evaluate the exact "conversations: participants insert" WITH
-- CHECK expression, clause by clause, using literal participant_a/participant_b
-- values (mirrors the real insert payload exactly). security invoker so it
-- runs under the caller's RLS context. Drop once the issue is confirmed fixed.
create or replace function public.debug_dm_full_check(p_participant_a uuid, p_participant_b uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'auth_uid', auth.uid(),
    'participant_a', p_participant_a,
    'participant_b', p_participant_b,
    'is_a_or_b_me', (p_participant_a = auth.uid() or p_participant_b = auth.uid()),
    'clause1_mutual_like', exists (
      select 1
        from public.partner_likes l1
        join public.partner_likes l2
          on l1.from_user_id = l2.to_user_id
         and l1.to_user_id   = l2.from_user_id
         and l2.kind         = 'like'
       where l1.kind         = 'like'
         and l1.from_user_id in (p_participant_a, p_participant_b)
         and l1.to_user_id   in (p_participant_a, p_participant_b)
    ),
    'clause2_director_to_registrant', exists (
      select 1
        from public.profiles      dir
        join public.tournaments    t   on t.director_id    = dir.id
        join public.registrations  r   on r.tournament_id  = t.id
       where dir.id = auth.uid()
         and (dir.role = 'director' or dir.is_director = true)
         and dir.director_status = 'approved'
         and r.player_id in (p_participant_a, p_participant_b)
         and r.player_id != auth.uid()
         and r.status    in ('held', 'registered', 'checked_in')
    ),
    'clause3_registrant_to_director', exists (
      select 1
        from public.registrations  r
        join public.tournaments    t   on t.id = r.tournament_id
       where r.player_id   = auth.uid()
         and r.status      in ('held', 'registered', 'checked_in')
         and t.director_id in (p_participant_a, p_participant_b)
         and t.director_id != auth.uid()
    ),
    'clause4_organizer_to_participant', exists (
      select 1
        from public.play_events       pe
        join public.play_participants pp on pp.event_id = pe.id
       where pe.organizer_id = auth.uid()
         and pp.claimed_by  in (p_participant_a, p_participant_b)
         and pp.claimed_by  != auth.uid()
    ),
    'clause5_anyone_to_organizer', exists (
      select 1
        from public.play_events pe
       where pe.organizer_id in (p_participant_a, p_participant_b)
         and pe.organizer_id != auth.uid()
    ),
    'current_role', current_setting('role', true),
    'current_user', current_user
  );
$$;

grant execute on function public.debug_dm_full_check to authenticated;
