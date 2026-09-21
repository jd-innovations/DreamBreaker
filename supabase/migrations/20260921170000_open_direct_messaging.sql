-- Anyone may message anyone. The recipient decides what to do about it.
--
-- get_or_create_direct_conversation used to require a real relationship:
-- mutual partner likes, director <-> registered player, event organiser or
-- participant, an approved director with an open tournament, an active
-- marketplace listing, or a shared group. That allowlist is removed here.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
--
-- The directory lets people find each other; refusing the Message button they
-- then reach for makes the directory a dead end. Facebook's model is the one
-- being copied, and its important property is not that messaging is open —
-- it is WHERE the friction sits. The sender never hits a wall; the control
-- lives entirely with the recipient, who can ignore, block or report.
--
-- Product owner's decision, 2026-09-21: open messaging with block/report only,
-- rather than a quarantined message-requests inbox. A requests folder remains
-- the better long-term answer and is the natural next step if this is abused.
--
-- ── What replaces the allowlist ─────────────────────────────────────────────
--
-- 1. is_blocked_between(), checked HERE for the first time. The old function
--    never checked it — the allowlist made that oversight invisible, since a
--    blocked pair rarely had a qualifying relationship. With the allowlist
--    gone it would have been the only thing standing between a blocked user
--    and a fresh conversation. It is now enforced in three places: this
--    function, the messages INSERT policy, and the push trigger
--    (20260921120000).
--
-- 2. A cap of 30 NEW conversations started per user per rolling 24 hours.
--    Bounds a spam run to a fixed blast radius without touching anyone's
--    normal use — the realistic ceiling for a person genuinely reaching out is
--    a handful a day. Existing conversations are unaffected: the cap counts
--    creations, and the early return above it means replying to, or reopening,
--    an existing thread never consumes any of it.
--
-- Not a substitute for either: Apple guideline 1.2 report-and-block already
-- exists on profiles and message threads, and remains the user-facing control.
create or replace function public.get_or_create_direct_conversation(p_partner_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_created_id uuid;
  v_started_today integer;
  c_daily_cap constant integer := 30;
begin
  if v_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001', hint = 'You must be signed in to start a conversation.';
  end if;

  if p_partner_id is null then
    raise exception 'missing_partner'
      using errcode = 'P0002', hint = 'A conversation partner is required.';
  end if;

  if p_partner_id = v_user_id then
    raise exception 'self_conversation_not_allowed'
      using errcode = 'P0003', hint = 'You cannot start a conversation with yourself.';
  end if;

  select c.id into v_existing_id
    from public.conversations c
   where coalesce(c.conversation_type, 'direct') = 'direct'
     and (
       (c.participant_a = v_user_id and c.participant_b = p_partner_id)
       or
       (c.participant_a = p_partner_id and c.participant_b = v_user_id)
     )
   order by c.created_at asc
   limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  -- Deliberately the same error code and a deliberately vague hint: telling a
  -- blocked sender "they blocked you" hands them information the block was
  -- meant to withhold.
  if public.is_blocked_between(v_user_id, p_partner_id) then
    raise exception 'direct_conversation_not_allowed'
      using errcode = 'P0004', hint = 'This conversation is not available.';
  end if;

  select count(*) into v_started_today
    from public.conversations c
   where c.created_by = v_user_id
     and coalesce(c.conversation_type, 'direct') = 'direct'
     and c.created_at > now() - interval '24 hours';

  if v_started_today >= c_daily_cap then
    raise exception 'conversation_rate_limited'
      using errcode = 'P0005',
            hint = 'You have started a lot of new conversations today. Try again tomorrow.';
  end if;

  insert into public.conversations (
    conversation_type,
    participant_a,
    participant_b,
    created_by
  ) values (
    'direct',
    v_user_id,
    p_partner_id,
    v_user_id
  )
  returning id into v_created_id;

  return v_created_id;
end;
$function$;

comment on function public.get_or_create_direct_conversation(uuid) is
  'Creates (or returns) a direct conversation. The relationship allowlist was removed on 2026-09-21: anyone may now message anyone, and the recipient decides what to do about it via block and report. Two controls replace it — is_blocked_between(), enforced here AND on message INSERT and in the push trigger (20260921120000), and a cap of 30 new conversations started per user per 24h.';
