-- Support replies get their own notification, and stop arriving as chat.
--
-- ── What was already happening ──────────────────────────────────────────────
-- A support ticket is backed by a conversation whose only participant is the
-- ticket owner; an admin answering writes an ordinary message row. So
-- notify_new_message ALREADY pushed every support reply — as a direct message,
-- titled with the admin's personal name, and silenced by notif_messages. A
-- player who turns chat pushes off therefore stopped hearing answers to
-- questions they had asked us, which nobody would choose.
--
-- Two changes, which must land together or a reply is pushed twice:
--   1. notify_new_message skips conversations of type 'support'.
--   2. fn_notify_support_ticket_reply — which already sends the branded email —
--      also writes the in-app notification, which the dispatcher pushes.
--
-- ── Why it is 'critical' ────────────────────────────────────────────────────
-- The player started this conversation by asking for help. An answer is not
-- marketing: it should not wait for quiet hours or spend a daily allowance,
-- and it has no pref_column for the same reason.
--
-- ── Where it lands ──────────────────────────────────────────────────────────
-- /conversation/<id> is a real deep-link root, so a tap opens the ticket
-- thread itself rather than the app's home screen.
--
-- Dry runs: an admin reply produced one notification linking at the thread;
-- the player's own follow-up produced none; direct messages still push as chat.

update public.notification_automations set
  title_template = 'We replied to your question',
  body_template  = '{{message_preview}}',
  link_template  = '/conversation/{{conversation_id}}',
  wired = true
where key = 'support_ticket_reply';

-- 1. Chat push stops covering support.
create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_type text;
begin
  -- Support replies are answered by fn_notify_support_ticket_reply, which says
  -- who it is from and is not governed by the chat preference. Without this
  -- guard the same reply is pushed twice.
  select conversation_type into v_type from public.conversations where id = new.conversation_id;
  if v_type is not distinct from 'support' then
    return new;
  end if;

  if not exists (
    select 1
      from public.push_tokens pt
     where pt.user_id <> new.sender_id
       and pt.user_id in (
         select participant_a from public.conversations where id = new.conversation_id
         union
         select participant_b from public.conversations where id = new.conversation_id
         union
         select user_id from public.conversation_participants where conversation_id = new.conversation_id
       )
  ) then
    return new;
  end if;

  perform net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-message-push',
    headers := private.push_dispatch_headers(),
    body := jsonb_build_object('kind', 'message', 'messageId', new.id)
  );

  return new;
end;
$$;

-- 2. The support reply sender gains the in-app notification, and stops
--    answering itself: an admin can raise a ticket like anyone else, and the
--    email half has had that flaw since 20260807000000.
create or replace function public.fn_notify_support_ticket_reply()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_conversation_type text;
  v_sender_role public.user_role;
  v_ticket_id uuid;
  v_ticket_subject text;
  v_ticket_user_id uuid;
  v_reporter_email text;
  v_preview text;
  v_copy record;
begin
  select conversation_type into v_conversation_type from public.conversations where id = NEW.conversation_id;
  if v_conversation_type is distinct from 'support' then
    return NEW;
  end if;

  select role into v_sender_role from public.profiles where id = NEW.sender_id;
  if v_sender_role is distinct from 'admin' then
    return NEW;
  end if;

  select id, subject, user_id into v_ticket_id, v_ticket_subject, v_ticket_user_id
  from public.support_tickets where conversation_id = NEW.conversation_id;
  if v_ticket_user_id is null then
    return NEW;
  end if;

  -- Never answer yourself.
  if NEW.sender_id = v_ticket_user_id then
    return NEW;
  end if;

  v_preview := left(coalesce(NEW.body, 'Sent an attachment.'), 200);

  select email into v_reporter_email from public.profiles where id = v_ticket_user_id;
  if v_reporter_email is not null then
    perform public.fn_send_transactional_email(jsonb_build_object(
      'to', v_reporter_email,
      'templateKey', 'support_ticket_reply',
      'variables', jsonb_build_object(
        'subject', v_ticket_subject,
        'message_preview', v_preview
      ),
      'idempotencyKey', 'support-ticket-reply/' || NEW.id
    ));
  end if;

  select * into v_copy from private.render_automation('support_ticket_reply', jsonb_build_object(
    'subject',          coalesce(v_ticket_subject, 'your question'),
    'message_preview',  left(v_preview, 140),
    'conversation_id',  NEW.conversation_id::text
  ));

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (v_ticket_user_id, 'support_ticket_reply',
          coalesce(v_copy.title, 'We replied to your question'),
          coalesce(v_copy.body, left(v_preview, 140)),
          coalesce(v_copy.link, '/conversation/' || NEW.conversation_id),
          'support-reply/' || NEW.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return NEW;
end;
$$;
