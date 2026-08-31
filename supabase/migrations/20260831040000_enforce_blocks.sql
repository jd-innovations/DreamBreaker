-- Blocks that actually block (TODO1.1 item 4.3).
--
-- ── What the block button did before this ───────────────────────────────────
--
-- Almost nothing. The comment at the top of
-- apps/mobile/src/lib/services/blocking.ts said so plainly:
--
--   "No screen in the app reads this table yet (no blocked-content filtering
--    elsewhere)"
--
-- blocked_users was write-only. The single exception was v_mutual_matches
-- (20260824130000), which honours it in matchmaking. Everywhere else — direct
-- messages above all — a blocked person could carry on exactly as before. The
-- UI offered protection the system did not provide, which is worse than having
-- no button at all: someone who blocks a harasser stops looking for other
-- remedies.
--
-- Production has zero rows in blocked_users today, so nobody is currently
-- exposed and there is nothing to migrate. That is the reason to do this now
-- rather than after the first person needs it.
--
-- ── Why in the database ─────────────────────────────────────────────────────
--
-- Client-side filtering is a display preference, not a safety boundary: it can
-- be bypassed with a direct PostgREST call, and every new screen re-opens the
-- hole. RLS and triggers hold regardless of which client is talking.
--
-- ── Scope of THIS migration ─────────────────────────────────────────────────
--
-- Direct messaging only, deliberately. It is the highest-harm surface and the
-- one a block is really about. Group visibility, invites, search ranking and
-- profile access each need their own product decision about what a block should
-- mean there — blocking someone in a 40-person group chat is not the same
-- question as blocking them in a DM — and guessing at those in a migration
-- would bake in answers nobody agreed to.

-- ── The shared predicate ────────────────────────────────────────────────────
--
-- SECURITY DEFINER because it must see rows the caller cannot: RLS on
-- blocked_users lets you read your OWN blocks, so a plain query can tell you
-- whether YOU blocked THEM but never whether they blocked you. A one-directional
-- check is useless here — the person being blocked is exactly the one who must
-- be stopped.

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.blocked_users
     where (blocker_id = a and blocked_id = b)
        or (blocker_id = b and blocked_id = a)
  );
$$;

comment on function public.is_blocked_between(uuid, uuid) is
  'True when either user has blocked the other (TODO1.1 4.3). SECURITY DEFINER '
  'because RLS only exposes a caller''s own blocks, and the direction that '
  'matters most is the one the caller cannot see.';

revoke all on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, service_role;

-- ── Enforcement: sending ────────────────────────────────────────────────────
--
-- A trigger rather than an RLS predicate. RLS rejects with a bare "new row
-- violates row-level security policy", which tells the sender nothing and
-- would read as a bug; a trigger can name the reason. It also keeps the
-- existing send policy readable instead of growing a second clause.
--
-- Only direct conversations. A group is a different question — see the scope
-- note above.

create or replace function public.fn_block_message_send()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_a uuid;
  v_b uuid;
  v_type text;
  v_other uuid;
begin
  select participant_a, participant_b, coalesce(conversation_type, 'direct')
    into v_a, v_b, v_type
    from public.conversations
   where id = new.conversation_id;

  if v_type is distinct from 'direct' then
    return new;
  end if;

  v_other := case when new.sender_id = v_a then v_b
                  when new.sender_id = v_b then v_a
                  else null end;

  if v_other is null then
    return new;
  end if;

  if public.is_blocked_between(new.sender_id, v_other) then
    raise exception 'This conversation is unavailable.'
      using errcode = 'P0004';
  end if;

  return new;
end;
$$;

comment on function public.fn_block_message_send() is
  'Rejects direct messages between users where either has blocked the other '
  '(TODO1.1 4.3). Deliberately vague message: see the migration.';

-- The message is deliberately vague — "This conversation is unavailable."
--
-- Saying "you have been blocked" tells a harasser they were blocked, which
-- turns the block itself into a signal and invites a new account. It also leaks
-- the blocker's action to the blocked party. Standard practice in every product
-- that has thought about this is to fail quietly and identically to any other
-- unavailable conversation.

drop trigger if exists trg_block_message_send on public.messages;
create trigger trg_block_message_send
  before insert on public.messages
  for each row execute function public.fn_block_message_send();

-- ── Enforcement: reading and listing ────────────────────────────────────────
--
-- Blocking hides the conversation as well as stopping new messages. Without
-- this the thread stays in the inbox with its history, which is not what anyone
-- means by "block" — and leaves a live surface where the other party's name and
-- avatar keep appearing.
--
-- Added as an extra restrictive policy rather than by editing the existing
-- permissive ones. In Postgres, RESTRICTIVE policies are ANDed with the
-- permissive set, so this cannot accidentally widen access — the worst it can
-- do is deny. Editing "conversations: participants read" in place would have
-- risked exactly that.

drop policy if exists "conversations: not blocked" on public.conversations;
create policy "conversations: not blocked"
  on public.conversations
  as restrictive
  for select
  to authenticated
  using (
    coalesce(conversation_type, 'direct') <> 'direct'
    or participant_a is null
    or participant_b is null
    or not public.is_blocked_between(participant_a, participant_b)
  );

comment on policy "conversations: not blocked" on public.conversations is
  'Hides direct conversations where either participant has blocked the other '
  '(TODO1.1 4.3). RESTRICTIVE so it can only ever deny, never widen.';

-- Messages in a hidden conversation are already unreachable through the app,
-- which reads messages by conversation — but not through a direct PostgREST
-- query on messages. Closed here so the boundary does not depend on how the
-- caller asks.

drop policy if exists "messages: not blocked" on public.messages;
create policy "messages: not blocked"
  on public.messages
  as restrictive
  for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and (
           coalesce(c.conversation_type, 'direct') <> 'direct'
           or c.participant_a is null
           or c.participant_b is null
           or not public.is_blocked_between(c.participant_a, c.participant_b)
         )
    )
  );

comment on policy "messages: not blocked" on public.messages is
  'Hides messages in blocked direct conversations (TODO1.1 4.3). RESTRICTIVE.';

-- ── Push ────────────────────────────────────────────────────────────────────
--
-- notify_new_message resolves recipients itself and does not go through RLS —
-- it is SECURITY DEFINER. The send trigger above already stops a blocked
-- message being written at all, so no push can follow one. Left alone rather
-- than adding a redundant check that would have to be kept in step.
