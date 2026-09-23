-- Email for the three money-at-risk automations, and the Email channel they
-- were stripped of earlier on 2026-09-23 restored — this time honoured.
--
-- The channel came off because listing it was a lie: no template existed and
-- no sender sent one. Rather than leave a push-only path for events where
-- money is at stake, the templates now exist and the senders honour the
-- channel, so the toggle is real in both directions.
--
--   membership_payment_failed   a renewal did not go through. The strongest
--                               case for email: a push can be missed, and
--                               benefits stop when the term ends.
--   membership_renewing         a charge is coming. Email is the medium people
--                               keep for money they will be billed.
--   coach_voucher_expiring      a lesson already paid for is about to be lost.
--
-- Bodies follow the Phase 5 shell rules: no hardcoded text colour (the shell
-- owns colour so dark mode works), an <h2> heading, a gold CTA pill, and
-- layout = 'transactional' so the footer carries no unsubscribe link — you
-- cannot unsubscribe from a receipt for something you are paying for.
--
-- Each sender passes exactly the variables its template declares; a mismatch
-- would be refused by send-transactional-email's unresolved-variable guard
-- (422) rather than mailing a literal {{token}}.

insert into public.email_templates (key, name, subject, preheader, html_body, layout, enabled, variables)
values
  ('membership_payment_failed', 'Membership payment failed',
   'We could not renew your membership',
   'Update your payment method to keep your benefits.',
   '<h2>Payment problem</h2><p>Hi {{first_name}},</p><p>We tried to renew your membership and the payment did not go through. Your benefits stay active until {{expiry_date}}.</p><p>Updating your payment method takes a moment and keeps everything running.</p><p><a href="{{link_url}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Update payment method</a></p>',
   'transactional', true, array['first_name','expiry_date','link_url']),

  ('membership_renewing', 'Membership renewing soon',
   'Your membership renews on {{renewal_date}}',
   'Just a heads-up — nothing to do.',
   '<h2>Your membership renews soon</h2><p>Hi {{first_name}},</p><p>Your membership renews on <strong>{{renewal_date}}</strong>. There is nothing you need to do — this is just so the charge is not a surprise.</p><p>You can change or cancel it any time before then.</p><p><a href="{{link_url}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Manage membership</a></p>',
   'transactional', true, array['first_name','renewal_date','link_url']),

  ('coach_voucher_expiring', 'Coaching voucher expiring',
   'Your session with {{coach_name}} expires {{expiry_date}}',
   'Book it before it goes.',
   '<h2>Use it before it goes</h2><p>Hi {{first_name}},</p><p>Your session with <strong>{{coach_name}}</strong> expires on <strong>{{expiry_date}}</strong>. It is already paid for — book it in and get on court.</p><p><a href="{{link_url}}" style="background:#C9A84C;color:#0A1228;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Book your session</a></p>',
   'transactional', true, array['first_name','coach_name','expiry_date','link_url'])
on conflict (key) do nothing;

update public.notification_automations
   set channels = array_append(channels, 'email')
 where key in ('membership_payment_failed', 'membership_renewing', 'coach_voucher_expiring')
   and not ('email' = any(channels));

-- ── Senders ─────────────────────────────────────────────────────────────────

-- Membership store events: BILLING_ISSUE and EXPIRATION write the notification;
-- BILLING_ISSUE now also emails, because that is the one where money stops.
create or replace function public.fn_notify_membership_store_event()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_key      text;
  v_copy     record;
  v_email    text;
  v_name     text;
  v_expires  timestamptz;
  v_email_on boolean;
begin
  if new.user_id is null then
    return new;
  end if;

  v_key := case new.event_type
             when 'BILLING_ISSUE' then 'membership_payment_failed'
             when 'EXPIRATION'    then 'membership_expired'
             else null
           end;
  if v_key is null then
    return new;
  end if;

  select * into v_copy from private.render_automation(v_key, '{}'::jsonb);

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (new.user_id, v_key,
          coalesce(v_copy.title, case v_key when 'membership_payment_failed'
                                       then 'Payment problem' else 'Your membership has ended' end),
          coalesce(v_copy.body, 'Open the app to check your membership.'),
          coalesce(v_copy.link, '/membership-settings'),
          'membership-event/' || new.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  if v_key = 'membership_payment_failed' then
    select 'email' = any(channels) into v_email_on
      from public.notification_automations where key = v_key;

    if coalesce(v_email_on, false) then
      select p.email, coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'there')
        into v_email, v_name
        from public.profiles p where p.id = new.user_id and p.deleted_at is null;

      select m.expires_at into v_expires
        from public.memberships m
       where m.user_id = new.user_id and m.status = 'active'
       order by m.expires_at desc nulls last limit 1;

      if v_email is not null then
        perform public.fn_send_transactional_email(jsonb_build_object(
          'to', v_email,
          'templateKey', 'membership_payment_failed',
          'variables', jsonb_build_object(
            'first_name',  v_name,
            -- No expiry on file reads as "soon" rather than an empty gap or a
            -- 422 from the unresolved-variable guard.
            'expiry_date', coalesce(to_char(v_expires, 'FMDay, FMMonth FMDD'), 'soon'),
            'link_url',    'https://pickleballapp.app/membership'
          ),
          'idempotencyKey', 'membership-billing/' || new.id
        ));
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.send_membership_renewing()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a          public.notification_automations%rowtype;
  v_days     integer;
  v_hour     integer;
  v_email_on boolean;
  r          record;
  v_copy     record;
  v_count    integer := 0;
begin
  select * into a from public.notification_automations where key = 'membership_renewing';
  if not found or not a.enabled then
    return 0;
  end if;

  v_days     := coalesce((a.timing ->> 'days_before')::int, 7);
  v_hour     := coalesce((a.timing ->> 'send_local_hour')::int, 10);
  v_email_on := 'email' = any(a.channels);

  for r in
    select m.user_id, m.expires_at, m.id membership_id, m.term_seq,
           coalesce(p.timezone, 'UTC') tz, p.email,
           coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'there') first_name
      from public.memberships m
      join public.profiles p on p.id = m.user_id
     where m.status = 'active'
       -- Only when it will actually charge them.
       and m.will_renew
       and m.expires_at is not null
       and m.expires_at > now()
       and m.expires_at <= now() + make_interval(days => v_days)
       and p.deleted_at is null
       and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC')))::int >= v_hour
       and not exists (
         select 1 from public.notifications n
          where n.idempotency_key = 'membership-renewing/' || m.id || '/' || m.term_seq
       )
  loop
    if private.automation_push_blocked_reason(r.user_id, 'membership_renewing')
       in ('quiet_hours', 'daily_cap', 'weekly_cap', 'throttled') then
      continue;
    end if;

    select * into v_copy from private.render_automation('membership_renewing', jsonb_build_object(
      'renewal_date', to_char(r.expires_at at time zone r.tz, 'FMDay, FMMonth FMDD')
    ));

    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (r.user_id, 'membership_renewing',
            coalesce(v_copy.title, 'Your membership renews soon'),
            coalesce(v_copy.body, 'Your membership renews shortly.'),
            coalesce(v_copy.link, '/membership-settings'),
            'membership-renewing/' || r.membership_id || '/' || r.term_seq)
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    if v_email_on and r.email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', r.email,
        'templateKey', 'membership_renewing',
        'variables', jsonb_build_object(
          'first_name',   r.first_name,
          'renewal_date', to_char(r.expires_at at time zone r.tz, 'FMDay, FMMonth FMDD'),
          'link_url',     'https://pickleballapp.app/membership'
        ),
        'idempotencyKey', 'membership-renewing/' || r.membership_id || '/' || r.term_seq
      ));
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.send_coach_voucher_expiring()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a          public.notification_automations%rowtype;
  days       integer[];
  i          integer;
  d          integer;
  v_floor    integer;
  v_hour     integer;
  v_email_on boolean;
  r          record;
  v_copy     record;
  v_count    integer := 0;
begin
  select * into a from public.notification_automations where key = 'coach_voucher_expiring';
  if not found or not a.enabled then
    return 0;
  end if;

  v_hour     := coalesce((a.timing ->> 'send_local_hour')::int, 10);
  v_email_on := 'email' = any(a.channels);

  -- ASCENDING: most urgent band first, so a cap drops the relaxed reminder.
  select coalesce(array_agg(value::integer order by value::integer), array[1, 3, 7, 15, 30])
    into days
    from jsonb_array_elements_text(coalesce(a.timing -> 'days_before_list', '[30,15,7,3,1]'::jsonb)) value;

  for i in 1 .. array_length(days, 1) loop
    d := days[i];
    v_floor := coalesce(days[i - 1], 0);

    for r in
      select e.id entitlement_id, e.buyer_id, e.expires_at, e.coach_id,
             coalesce(p.timezone, 'UTC') tz, p.email,
             coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'there') first_name,
             (select full_name from public.profiles c where c.id = e.coach_id) coach_name
        from public.coach_voucher_entitlements e
        join public.profiles p on p.id = e.buyer_id
       where e.status = 'active'
         and e.remaining_redemptions > 0
         and e.expires_at is not null
         and e.expires_at >  now() + make_interval(days => v_floor)
         and e.expires_at <= now() + make_interval(days => d)
         and p.deleted_at is null
         and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC')))::int >= v_hour
         and not exists (
           select 1 from public.notifications n
            where n.idempotency_key = 'coach-expiring/' || e.id || '/' || d
         )
    loop
      if private.automation_push_blocked_reason(r.buyer_id, 'coach_voucher_expiring')
         in ('quiet_hours', 'daily_cap', 'weekly_cap', 'throttled') then
        continue;
      end if;

      select * into v_copy from private.render_automation('coach_voucher_expiring', jsonb_build_object(
        'coach_name',  coalesce(r.coach_name, 'your coach'),
        'expiry_date', to_char(r.expires_at at time zone r.tz, 'FMDay, FMMonth FMDD')
      ));

      insert into public.notifications (user_id, type, title, body, link, idempotency_key)
      values (r.buyer_id, 'coach_voucher_expiring',
              coalesce(v_copy.title, 'Use it before it goes'),
              coalesce(v_copy.body, 'Your coaching voucher expires soon.'),
              coalesce(v_copy.link, '/wallet'),
              'coach-expiring/' || r.entitlement_id || '/' || d)
      on conflict (idempotency_key) where idempotency_key is not null do nothing;

      if v_email_on and r.email is not null then
        perform public.fn_send_transactional_email(jsonb_build_object(
          'to', r.email,
          'templateKey', 'coach_voucher_expiring',
          'variables', jsonb_build_object(
            'first_name',  r.first_name,
            'coach_name',  coalesce(r.coach_name, 'your coach'),
            'expiry_date', to_char(r.expires_at at time zone r.tz, 'FMDay, FMMonth FMDD'),
            'link_url',    'https://pickleballapp.app/wallet'
          ),
          -- Per voucher per band, matching the notification.
          'idempotencyKey', 'coach-expiring/' || r.entitlement_id || '/' || d
        ));
      end if;

      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;
