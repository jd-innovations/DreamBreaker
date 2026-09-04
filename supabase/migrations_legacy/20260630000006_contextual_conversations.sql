-- =============================================================================
-- Contextual conversations for Community Play, tournaments, and future groups
-- =============================================================================

-- Keep participant_a / participant_b for existing 1:1 messaging, but allow
-- contextual group conversations that do not have exactly two participants.
alter table public.conversations
  alter column participant_a drop not null,
  alter column participant_b drop not null,
  add column if not exists conversation_type text not null default 'direct',
  add column if not exists related_play_event_id uuid references public.play_events(id) on delete cascade,
  add column if not exists related_tournament_id uuid references public.tournaments(id) on delete cascade,
  add column if not exists title text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.conversations
  drop constraint if exists conversations_type_check,
  add constraint conversations_type_check check (
    conversation_type in ('direct', 'play_event', 'tournament', 'team', 'group', 'announcement')
  );

alter table public.conversations
  drop constraint if exists conversations_context_check,
  add constraint conversations_context_check check (
    (conversation_type = 'direct' and participant_a is not null and participant_b is not null)
    or (conversation_type = 'play_event' and related_play_event_id is not null)
    or (conversation_type in ('tournament', 'announcement') and related_tournament_id is not null)
    or (conversation_type in ('team', 'group'))
  );

create index if not exists idx_conversations_type on public.conversations(conversation_type);
create index if not exists idx_conversations_related_play_event on public.conversations(related_play_event_id);
create index if not exists idx_conversations_related_tournament on public.conversations(related_tournament_id);
create index if not exists idx_conversations_created_by on public.conversations(created_by);

create unique index if not exists uq_conversations_play_event
  on public.conversations(related_play_event_id)
  where conversation_type = 'play_event' and related_play_event_id is not null;

create unique index if not exists uq_conversations_tournament_group
  on public.conversations(related_tournament_id)
  where conversation_type = 'tournament' and related_tournament_id is not null;

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null default 'member',
  joined_at       timestamptz not null default now(),

  primary key (conversation_id, user_id),
  constraint conversation_participants_role_check check (role in ('owner', 'admin', 'member'))
);

comment on table public.conversation_participants is 'Membership rows for contextual/group conversations. Legacy direct conversations continue to use participant_a / participant_b.';

create index if not exists idx_conversation_participants_user
  on public.conversation_participants(user_id, conversation_id);

alter table public.conversation_participants enable row level security;

-- Security-definer helper avoids recursive RLS checks while giving one source
-- of truth for legacy direct, explicit members, Community Play, and tournaments.
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
       )
  );
$$;

-- Backfill explicit membership for legacy direct conversations.
insert into public.conversation_participants (conversation_id, user_id, role)
select id, participant_a, 'member'
  from public.conversations
 where participant_a is not null
on conflict (conversation_id, user_id) do nothing;

insert into public.conversation_participants (conversation_id, user_id, role)
select id, participant_b, 'member'
  from public.conversations
 where participant_b is not null
on conflict (conversation_id, user_id) do nothing;

-- Conversation participant RLS.
drop policy if exists "conversation_participants: participants read" on public.conversation_participants;
create policy "conversation_participants: participants read"
  on public.conversation_participants for select
  using (public.is_conversation_participant(conversation_id, (select auth.uid())));

drop policy if exists "conversation_participants: self join" on public.conversation_participants;
create policy "conversation_participants: self join"
  on public.conversation_participants for insert
  with check (
    user_id = (select auth.uid())
    and public.is_conversation_participant(conversation_id, (select auth.uid()))
  );

drop policy if exists "conversation_participants: self update" on public.conversation_participants;
create policy "conversation_participants: self update"
  on public.conversation_participants for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())) ;

drop policy if exists "conversation_participants: self leave" on public.conversation_participants;
create policy "conversation_participants: self leave"
  on public.conversation_participants for delete
  using (user_id = (select auth.uid()));

-- Conversations RLS: preserve 1:1 policy behavior and extend read/update to
-- contextual members.
drop policy if exists "conversations: participants read" on public.conversations;
create policy "conversations: participants read"
  on public.conversations for select
  using (public.is_conversation_participant(id, (select auth.uid())));

drop policy if exists "conversations: participants update" on public.conversations;
create policy "conversations: participants update"
  on public.conversations for update
  using (public.is_conversation_participant(id, (select auth.uid())))
  with check (public.is_conversation_participant(id, (select auth.uid())));

-- Replace insert policy with a direct-or-contextual version.
drop policy if exists "conversations: participants insert if matched" on public.conversations;
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

-- Messages RLS: participant helper covers legacy 1:1 and contextual groups.
drop policy if exists "messages: participants read" on public.messages;
create policy "messages: participants read"
  on public.messages for select
  using (public.is_conversation_participant(conversation_id, (select auth.uid())));

drop policy if exists "messages: participant send" on public.messages;
create policy "messages: participant send"
  on public.messages for insert
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_participant(conversation_id, (select auth.uid()))
  );

drop policy if exists "messages: participant mark read" on public.messages;
create policy "messages: participant mark read"
  on public.messages for update
  using (
    sender_id != (select auth.uid())
    and public.is_conversation_participant(conversation_id, (select auth.uid()))
  )
  with check (
    sender_id != (select auth.uid())
    and public.is_conversation_participant(conversation_id, (select auth.uid()))
  );