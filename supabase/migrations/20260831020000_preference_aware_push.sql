-- Preference-aware push dispatch (TODO1.1 item 5.1).
--
-- profiles already carries four notification preferences — notif_new_match,
-- notif_liked_you, notif_hold_expiry, notif_tournaments — written by web's
-- match-settings panel and honoured by nothing. Mobile's notifications screen
-- meanwhile showed its own toggles that were pure component state.
--
-- This adds the one preference the dispatch path can actually respect today,
-- and makes notify_new_message respect it.
--
-- ── Why only messages ───────────────────────────────────────────────────────
--
-- notify_new_message is the ONLY trigger that sends a push. The other four
-- preferences describe notifications this project does not send yet, so wiring
-- them into dispatch would be wiring them into nothing. They stay as stored
-- intent, honoured when those senders exist.
--
-- ── Why not quiet hours ─────────────────────────────────────────────────────
--
-- The mobile screen offered "10:00 PM - 7:00 AM". There is no timezone on
-- profiles, so a server-side trigger cannot know when 10 PM is for a given
-- user; it would silence the wrong hours for anyone not in the database's
-- timezone. Implementing it needs a timezone column captured from the device
-- first. The toggle has been removed rather than left claiming to work.

alter table public.profiles
  add column if not exists notif_messages boolean not null default true;

comment on column public.profiles.notif_messages is
  'Push for new chat messages (TODO1.1 5.1). Honoured by notify_new_message. '
  'Defaults true: an existing user who never opens the setting keeps the '
  'behaviour they already had.';

-- Stored intent, not yet honoured — and labelled as such so nobody assumes
-- otherwise. send-transactional-email has no preference check today; when it
-- gets one, this is the column it reads. Kept rather than dropping the toggle
-- because email notifications are real and this preference is coherent, unlike
-- quiet hours (no timezone) or badge counts (never implemented).
alter table public.profiles
  add column if not exists notif_email_enabled boolean not null default true;

comment on column public.profiles.notif_email_enabled is
  'User intent for email notifications. NOT yet honoured by any sender — '
  'send-transactional-email does not check it. Wire it there before telling '
  'anyone this switch works.';

-- No grant changes needed. 20260825120000 restricted profiles to a column
-- allowlist for `anon` only, and notif_* is deliberately outside it, so new
-- preference columns are private by default. `authenticated` keeps the
-- table-level grant, which is what the app uses.

-- ── notify_new_message, now preference-aware ────────────────────────────────
--
-- Unchanged except for the added `notif_messages` test in the recipient
-- filter. Kept as a whole CREATE OR REPLACE rather than a patch because the
-- body is the contract — a future reader needs to see the entire recipient
-- resolution in one place, not reconstruct it from two migrations.

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

alter function public.notify_new_message() owner to postgres;
revoke all on function public.notify_new_message() from public;
grant all on function public.notify_new_message() to service_role;
