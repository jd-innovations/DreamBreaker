-- =============================================================================
-- Fix: direct-message RLS gap for Community Play organizer <-> participant.
-- Migration: 20260701000001_conversations_play_event_dm
--
-- Problem: "conversations: participants insert" (20260630000006) allows a
-- direct conversation only for (a) a mutual Partner Finder like, or (b) a
-- tournament director <-> one of their registrants. It has no clause for a
-- Community Play organizer messaging a claimed participant (or vice versa),
-- so "Message Organizer" / "Message Player" on a play_event fails RLS.
--
-- Fix: add the same two-sided pattern already used for tournaments, scoped to
-- play_events organizer_id <-> play_participants.claimed_by.
-- =============================================================================

drop policy if exists "conversations: participants insert" on public.conversations;

create policy "conversations: participants insert"
  on public.conversations for insert
  with check (
    (
      conversation_type = 'direct'
      and (participant_a = (select auth.uid()) or participant_b = (select auth.uid()))
      and (
        exists (
          select 1
            from public.partner_likes l1
            join public.partner_likes l2
              on l1.from_user_id = l2.to_user_id
             and l1.to_user_id   = l2.from_user_id
             and l2.kind         = 'like'
           where l1.kind         = 'like'
             and l1.from_user_id in (participant_a, participant_b)
             and l1.to_user_id   in (participant_a, participant_b)
        )
        or exists (
          select 1
            from public.profiles      dir
            join public.tournaments    t   on t.director_id    = dir.id
            join public.registrations  r   on r.tournament_id  = t.id
           where dir.id = (select auth.uid())
             and (dir.role = 'director' or dir.is_director = true)
             and dir.director_status = 'approved'
             and r.player_id in (participant_a, participant_b)
             and r.player_id != (select auth.uid())
             and r.status    in ('held', 'registered', 'checked_in')
        )
        or exists (
          select 1
            from public.registrations  r
            join public.tournaments    t   on t.id = r.tournament_id
           where r.player_id   = (select auth.uid())
             and r.status      in ('held', 'registered', 'checked_in')
             and t.director_id in (participant_a, participant_b)
             and t.director_id != (select auth.uid())
        )
        -- NEW: current user organizes a play_event that the other party has joined.
        or exists (
          select 1
            from public.play_events       pe
            join public.play_participants pp on pp.event_id = pe.id
           where pe.organizer_id = (select auth.uid())
             and pp.claimed_by  in (participant_a, participant_b)
             and pp.claimed_by  != (select auth.uid())
        )
        -- NEW: current user has joined a play_event that the other party organizes.
        or exists (
          select 1
            from public.play_participants pp
            join public.play_events       pe on pe.id = pp.event_id
           where pp.claimed_by  = (select auth.uid())
             and pe.organizer_id in (participant_a, participant_b)
             and pe.organizer_id != (select auth.uid())
        )
      )
    )
    or (
      conversation_type = 'play_event'
      and created_by = (select auth.uid())
      and related_play_event_id is not null
      and (
        exists (
          select 1 from public.play_events pe
           where pe.id = related_play_event_id
             and pe.organizer_id = (select auth.uid())
        )
        or exists (
          select 1 from public.play_participants pp
           where pp.event_id = related_play_event_id
             and pp.claimed_by = (select auth.uid())
        )
      )
    )
    or (
      conversation_type in ('tournament', 'announcement')
      and created_by = (select auth.uid())
      and related_tournament_id is not null
      and (
        exists (
          select 1 from public.tournaments t
           where t.id = related_tournament_id
             and t.director_id = (select auth.uid())
        )
        or exists (
          select 1 from public.registrations r
           where r.tournament_id = related_tournament_id
             and r.player_id = (select auth.uid())
             and r.status in ('held', 'registered', 'checked_in')
        )
      )
    )
  );

comment on policy "conversations: participants insert" on public.conversations is
  'Direct: mutual Partner Finder like, tournament director<->registrant, or play_event organizer<->claimed participant. Play_event/tournament: creator must be organizer/director or a participant/registrant of the target event.';
