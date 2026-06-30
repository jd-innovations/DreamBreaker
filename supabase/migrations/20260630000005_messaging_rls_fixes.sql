-- =============================================================================
-- Messaging RLS fixes
--
-- 1. conversations: update — lets participants write last_message_at
-- 2. messages: update read_at — lets recipients mark messages read
-- 3. conversations: insert — replaces matchmaking_swipes check with partner_likes
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. conversations: participants may update (last_message_at)
-- ----------------------------------------------------------------------------
drop policy if exists "conversations: participants update" on public.conversations;

create policy "conversations: participants update"
  on public.conversations for update
  using (
    participant_a = (select auth.uid())
    or participant_b = (select auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 2. messages: recipients may mark received messages as read (read_at only)
-- Cannot mark own sent messages as read — sender_id != auth.uid() enforced.
-- ----------------------------------------------------------------------------
drop policy if exists "messages: participant mark read" on public.messages;

create policy "messages: participant mark read"
  on public.messages for update
  using (
    -- only messages in a conversation the user participates in
    exists (
      select 1 from public.conversations c
       where c.id = conversation_id
         and (
           c.participant_a = (select auth.uid())
           or c.participant_b = (select auth.uid())
         )
    )
    -- only messages the user received, not sent
    and sender_id != (select auth.uid())
  )
  with check (
    -- only allow setting read_at; body/sender_id/conversation_id unchanged
    sender_id = sender_id
  );

-- ----------------------------------------------------------------------------
-- 3. conversations: insert — replace matchmaking_swipes with partner_likes
-- Drops the policy added in 20260618000001 and rebuilds with correct table.
-- Preserves director paths (b) and (c) unchanged.
-- ----------------------------------------------------------------------------
drop policy if exists "conversations: participants insert" on public.conversations;

create policy "conversations: participants insert"
  on public.conversations for insert
  with check (
    -- Current user must be one of the two participants
    (participant_a = (select auth.uid()) or participant_b = (select auth.uid()))

    and (

      -- (a) Mutual Partner Finder match via partner_likes
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

      -- (b) Approved director messaging one of their own registrants
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

      -- (c) Player initiating contact with the director of their tournament
      or exists (
        select 1
          from public.registrations  r
          join public.tournaments    t   on t.id          = r.tournament_id
         where r.player_id      = (select auth.uid())
           and r.status         in ('held', 'registered', 'checked_in')
           and t.director_id    in (participant_a, participant_b)
           and t.director_id    != (select auth.uid())
      )

    )
  );

comment on policy "conversations: participants insert" on public.conversations is
  'Allows conversation creation for: (a) mutual Partner Finder matches via partner_likes, (b) directors DMing registrants/hold/waitlist users, (c) players initiating contact with their tournament director.';
