-- P0 for the user directory: make "block" actually block.
--
-- Both gaps below are pre-existing. They become urgent because the directory
-- work that follows removes the relationship allowlist from
-- get_or_create_direct_conversation. Today a stranger cannot open a DM at all,
-- which quietly papers over the gaps below. Once anyone can message anyone,
-- block/report is the ONLY control, and it has to hold.

-- ── 1. Block is enforced on read, but not on write ──────────────────────────
--
-- is_blocked_between() is already wired into RLS on conversations and messages
-- — SELECT only. There is no INSERT check. So a blocked user can still insert a
-- message row today; the recipient simply cannot see it.
--
-- That is not harmless, because of (2) below: the insert still fires
-- notify_new_message, which still sends a push. The block hides the message and
-- delivers the notification — the exact inverse of what a blocked person wants.

drop policy if exists "messages: participant send" on public.messages;

create policy "messages: participant send"
  on public.messages for insert
  with check (
    sender_id = (select auth.uid())
    and is_conversation_participant(conversation_id, (select auth.uid()))
    -- New. Group threads (participant_a/b null, or a non-direct type) are out
    -- of scope: blocking is a one-to-one relationship and silently dropping
    -- someone's group message because one member blocked them would be a
    -- different and much worse feature.
    and not exists (
      select 1
        from public.conversations c
       where c.id = conversation_id
         and coalesce(c.conversation_type, 'direct') = 'direct'
         and c.participant_a is not null
         and c.participant_b is not null
         and is_blocked_between(c.participant_a, c.participant_b)
    )
  );

-- ── 2. The push trigger does not consult blocks ─────────────────────────────
--
-- Replaced whole rather than patched: the recipient filter IS the contract for
-- who gets notified, and a future reader needs to see all of it in one place
-- rather than reconstruct it across three migrations. Only the blocked-pair
-- clause is new; mute and notif_messages are unchanged from 20260831020000.

create or replace function public.notify_new_message() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_sender_name text;
  v_tokens text[];
  v_title text;
  v_body text;
begin
  select full_name into v_sender_name from public.profiles where id = new.sender_id;

  select array_agg(distinct pt.expo_push_token) into v_tokens
    from public.push_tokens pt
   where pt.user_id in (
     select recips.user_id
       from (
         select participant_a as user_id from public.conversations
          where id = new.conversation_id and participant_a is not null
         union
         select participant_b as user_id from public.conversations
          where id = new.conversation_id and participant_b is not null
         union
         select user_id from public.conversation_participants
          where conversation_id = new.conversation_id
       ) recips
      where recips.user_id != new.sender_id
        -- Per-conversation mute, unchanged.
        and not exists (
          select 1 from public.conversation_participant_settings s
           where s.conversation_id = new.conversation_id
             and s.user_id = recips.user_id
             and s.muted_until is not null
             and s.muted_until > now()
        )
        -- Global message preference. `is not false` rather than `= true` so a
        -- null — which the NOT NULL default should prevent, but which a bad
        -- backfill could produce — means "notify", matching the column default.
        -- Failing open is right here: the cost of a wrong send is an unwanted
        -- notification, the cost of a wrong skip is a missed message.
        and exists (
          select 1 from public.profiles p
           where p.id = recips.user_id
             and p.notif_messages is not false
        )
        -- NEW: never notify across a block, in either direction.
        --
        -- Fails CLOSED, unlike the preference check above, and deliberately so:
        -- the cost of a wrong send here is a notification from someone the
        -- recipient explicitly blocked, which is the failure the whole feature
        -- exists to prevent. A missed notification is the cheaper mistake.
        and not is_blocked_between(new.sender_id, recips.user_id)
   );

  if v_tokens is null or array_length(v_tokens, 1) is null then
    return new;
  end if;

  v_title := coalesce(v_sender_name, 'New message');
  v_body := left(new.body, 120);

  perform net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo'
    ),
    body := jsonb_build_object(
      'tokens', to_jsonb(v_tokens),
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object('conversationId', new.conversation_id, 'messageId', new.id)
    )
  );

  return new;
end;
$$;
