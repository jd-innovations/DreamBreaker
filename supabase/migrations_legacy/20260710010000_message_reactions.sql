-- Full emoji-picker message reactions (tapback-style), for both 1:1 DMs and
-- group/tournament chat. Patterned on group_post_likes' RLS shape, but needs
-- an `emoji` column since chat reactions are multi-emoji, not a single like.
-- No conversation_id column here (reactions belong to a message, not a
-- conversation directly) — RLS/queries join through messages.conversation_id
-- and reuse the existing is_conversation_participant() helper, so this one
-- table works across every conversation_type without special-casing.

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

comment on table public.message_reactions is 'Emoji tapback reactions on chat messages. One row per (message, user, emoji) — a user may react to the same message with multiple different emoji.';

alter table public.message_reactions enable row level security;

create policy "message reactions: participants read"
  on public.message_reactions for select
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_participant(m.conversation_id, (select auth.uid()))
    )
  );

create policy "message reactions: participant react"
  on public.message_reactions for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_participant(m.conversation_id, (select auth.uid()))
    )
  );

create policy "message reactions: own delete"
  on public.message_reactions for delete
  using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.message_reactions;
