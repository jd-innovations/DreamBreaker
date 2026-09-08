-- Bug found via smoke testing: is_conversation_participant() never learned
-- about group_members. A group member who isn't yet in
-- conversation_participants (and isn't the group creator) satisfies none of
-- the existing OR-branches, so they can never self-join
-- conversation_participants for their own group's chat (chicken-and-egg on
-- the "self join" policy) and can never read/send group chat messages.
--
-- Fix: add a branch mirroring the existing play_event/tournament membership
-- checks — active group_members of the group backing this conversation are
-- participants.

create or replace function public.is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.conversations c
     where c.id = p_conversation_id
       and p_user_id is not null
       and (
         c.participant_a = p_user_id
         or c.participant_b = p_user_id
         or c.created_by = p_user_id
         or exists (
           select 1
             from public.conversation_participants cp
            where cp.conversation_id = c.id
              and cp.user_id = p_user_id
         )
         or (
           c.related_play_event_id is not null
           and exists (
             select 1
               from public.play_events pe
              where pe.id = c.related_play_event_id
                and pe.organizer_id = p_user_id
           )
         )
         or (
           c.related_play_event_id is not null
           and exists (
             select 1
               from public.play_participants pp
              where pp.event_id = c.related_play_event_id
                and pp.claimed_by = p_user_id
           )
         )
         or (
           c.related_tournament_id is not null
           and exists (
             select 1
               from public.tournaments t
              where t.id = c.related_tournament_id
                and t.director_id = p_user_id
           )
         )
         or (
           c.related_tournament_id is not null
           and exists (
             select 1
               from public.registrations r
              where r.tournament_id = c.related_tournament_id
                and r.player_id = p_user_id
                and r.status in ('held', 'registered', 'checked_in')
           )
         )
         or exists (
           select 1
             from public.groups g
             join public.group_members gm on gm.group_id = g.id
            where g.conversation_id = c.id
              and gm.user_id = p_user_id
              and gm.status = 'active'
         )
       )
  );
$$;
