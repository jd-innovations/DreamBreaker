-- Blocks stop invitations too (TODO1.1 item 4.3, second half).
--
-- 20260831040000 stopped direct messages between blocked users and hid the
-- conversation. Inviting was still wide open: a blocked person could pull you
-- into a group or a play event, and could like you in partner finder. Each of
-- those puts their name in front of you and starts a thread of contact, which
-- is the thing a block is for.
--
-- Nobody thinks a block should permit an invitation, so unlike group visibility
-- or search ranking this needs no product decision — which is why it is here
-- and those are not.
--
-- ── One function, four column names ─────────────────────────────────────────
--
-- The three tables name their participants differently (inviter_id/invitee_id,
-- from_user_id/to_user_id). Rather than three near-identical functions that
-- would drift the moment one is edited, the trigger reads the column names from
-- its own arguments. to_jsonb(new) is what makes that possible in plpgsql.

create or replace function public.fn_block_contact_initiation()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_from uuid;
  v_to uuid;
  v_row jsonb;
begin
  v_row := to_jsonb(new);
  v_from := (v_row ->> tg_argv[0])::uuid;
  v_to := (v_row ->> tg_argv[1])::uuid;

  if v_from is null or v_to is null then
    return new;
  end if;

  if public.is_blocked_between(v_from, v_to) then
    -- Same wording as the message trigger, for the same reason: naming the
    -- block would tell a blocked person they were blocked, turning the block
    -- into a signal and inviting a fresh account.
    raise exception 'This action is unavailable.'
      using errcode = 'P0004';
  end if;

  return new;
end;
$$;

comment on function public.fn_block_contact_initiation() is
  'Rejects contact initiation between blocked users (TODO1.1 4.3). Generic over '
  'column names: pass the "from" and "to" column as trigger arguments.';

drop trigger if exists trg_block_group_invite on public.group_invites;
create trigger trg_block_group_invite
  before insert on public.group_invites
  for each row execute function public.fn_block_contact_initiation('inviter_id', 'invitee_id');

drop trigger if exists trg_block_play_event_invite on public.play_event_invites;
create trigger trg_block_play_event_invite
  before insert on public.play_event_invites
  for each row execute function public.fn_block_contact_initiation('inviter_id', 'invitee_id');

-- A like is contact initiation, not browsing: it can produce a match, and a
-- match produces a conversation.
drop trigger if exists trg_block_partner_like on public.partner_likes;
create trigger trg_block_partner_like
  before insert on public.partner_likes
  for each row execute function public.fn_block_contact_initiation('from_user_id', 'to_user_id');

-- ── matchmaking_swipes is deliberately NOT guarded ──────────────────────────
--
-- A swipe is browsing, and includes passes. Rejecting one would make the
-- discovery UI throw while someone flicks through cards — including when they
-- swipe LEFT on a person who blocked them, which is the outcome everybody
-- wants anyway.
--
-- Nothing escapes through it: v_mutual_matches (20260824130000) already filters
-- blocked pairs on read, so no match surfaces, and if one somehow did the
-- resulting conversation is covered by the message trigger and the RESTRICTIVE
-- policies from 20260831040000.
--
-- ── Still not covered, still needing a product decision ─────────────────────
--
-- Group visibility, search ranking and profile access. Blocking someone in a
-- 40-person group chat is not the same question as blocking them in a DM, and
-- hiding yourself from search is also a way of disappearing from people you did
-- not block.
