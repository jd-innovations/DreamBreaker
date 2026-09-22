-- Phase A.4: "send me a test" from /admin/notifications, and the write path
-- for editing an automation.
--
-- The test has to work while an automation is still DISABLED — previewing a
-- real push on a real phone is exactly what you do before switching one on.
-- So the resolver gains a `p_test` flag that skips the enabled/preference/cap
-- checks, and admin_test_automation is the only thing that can set it: it
-- sends to the CALLER'S OWN devices, never to anyone else, and only for an
-- admin. Everything else about the path is identical to a live send, so a
-- successful test proves the real thing works.
--
-- Rendering uses the same private.render_automation the senders use, with
-- obvious sample values, so the test shows the copy as edited.

create or replace function public.resolve_automation_push_recipients(
  p_notification_id uuid,
  p_test            boolean default false
)
returns table (tokens text[], title text, body text, data jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  n        public.notifications%rowtype;
  v_tokens text[];
begin
  select * into n from public.notifications where id = p_notification_id;
  if not found or n.created_at < now() - interval '10 minutes' then
    return;
  end if;

  -- A test skips the gate deliberately (see header). It cannot reach anyone
  -- else: the tokens below are the notification owner's, and only an admin
  -- acting on their own row can get p_test set.
  if not p_test and private.automation_push_blocked_reason(n.user_id, n.type) is not null then
    return;
  end if;

  select array_agg(distinct pt.expo_push_token) into v_tokens
    from public.push_tokens pt where pt.user_id = n.user_id;

  if v_tokens is null or array_length(v_tokens, 1) is null then
    return;
  end if;

  return query select
    v_tokens,
    n.title,
    left(n.body, 140),
    jsonb_build_object(
      'notificationId', n.id,
      'automationKey',  n.type,
      'link',           n.link,
      'test',           p_test
    );
end;
$$;

revoke all on function public.resolve_automation_push_recipients(uuid, boolean) from public, anon, authenticated;

-- Sample values for the preview. Deliberately unmistakable as samples, so a
-- test push is never confused for a real one at a glance.
create or replace function private.automation_sample_vars()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'tournament_name', 'Sample Open (test)',
    'tournament_id',   '00000000-0000-0000-0000-000000000000',
    'hours_left',      '2',
    'event_date',      to_char(now() + interval '7 days', 'FMDay, FMMonth FMDD'),
    'venue_name',      'Sample Courts',
    'checkin_time',    '8:00 AM',
    'reason',          'The venue could not be confirmed.'
  );
$$;

create or replace function public.admin_test_automation(p_key text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a       public.notification_automations%rowtype;
  v_copy  record;
  v_id    uuid;
  v_me    uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  select * into a from public.notification_automations where key = p_key;
  if not found then
    raise exception 'no automation %', p_key;
  end if;

  if not exists (select 1 from public.push_tokens pt where pt.user_id = v_me) then
    return jsonb_build_object('sent', false, 'reason', 'no_device');
  end if;

  select * into v_copy from private.render_automation(p_key, private.automation_sample_vars());

  -- A real notification row, so the test also shows how it looks in the app's
  -- notification list. The idempotency key is unique per test so repeat tests
  -- are not swallowed.
  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (v_me, p_key, v_copy.title, v_copy.body, v_copy.link,
          'automation-test/' || p_key || '/' || gen_random_uuid())
  returning id into v_id;

  -- Sent explicitly with the test flag rather than relying on the insert
  -- trigger, which would refuse while the automation is disabled.
  perform net.http_post(
    url     := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-message-push',
    headers := private.push_dispatch_headers(),
    body    := jsonb_build_object('kind', 'automation', 'notificationId', v_id, 'test', true)
  );

  return jsonb_build_object('sent', true, 'notification_id', v_id,
                            'title', v_copy.title, 'body', v_copy.body);
end;
$$;

revoke all on function public.admin_test_automation(text) from public, anon;
grant execute on function public.admin_test_automation(text) to authenticated;

-- A test push must not count against the caller's own frequency caps, and the
-- insert trigger would log one if the automation happened to be enabled. It
-- is filtered by the idempotency key prefix, which only this function writes.
create or replace function public.fn_dispatch_automation_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_reason   text;
  v_category text;
begin
  if new.idempotency_key like 'automation-test/%' then
    return new;
  end if;

  v_reason := private.automation_push_blocked_reason(new.user_id, new.type);
  if v_reason is not null then
    return new;
  end if;

  select category into v_category from public.notification_automations where key = new.type;

  insert into public.notification_push_log (user_id, automation_key, category, notification_id)
  values (new.user_id, new.type, v_category, new.id);

  perform net.http_post(
    url     := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-message-push',
    headers := private.push_dispatch_headers(),
    body    := jsonb_build_object('kind', 'automation', 'notificationId', new.id)
  );

  return new;
end;
$$;
