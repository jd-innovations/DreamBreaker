-- Membership notifications: renewing soon, payment problem, membership ended.
-- Real money moves here and nothing has ever told the member about any of it.
--
-- ── Where these hook in ─────────────────────────────────────────────────────
-- handle_membership_store_event is 6.6k of payment-critical logic turning
-- RevenueCat webhooks into membership rows. It is NOT edited here. Instead a
-- trigger on membership_store_events — the table that function writes every
-- event to before acting on it — turns the two events a member needs to hear
-- about into notifications. A bug in a notification can then never stop a
-- purchase, a renewal or an expiry being recorded.
--
-- ── What stays silent, and why ──────────────────────────────────────────────
--   RENEWAL, INITIAL_PURCHASE  the store sends its own receipt; a second
--                              "you paid" is noise.
--   CANCELLATION               the member just did it themselves. They hear
--                              from us at EXPIRATION, when it actually bites.
--
-- ── {{amount}} is gone ──────────────────────────────────────────────────────
-- The seeded copy promised a price. Nothing stores one: no platform setting,
-- no column on memberships. RevenueCat sends a price on some events but not on
-- the scheduled reminder, where there is no event at all. Rather than show it
-- sometimes, or invent it, the copy says WHEN rather than HOW MUCH, and the
-- screen the tap lands on can show the price.
--
-- ── Live state ──────────────────────────────────────────────────────────────
-- Only two membership rows exist, both admin grants: the StoreKit purchase
-- path is not live yet. These senders are therefore correct but idle, which is
-- the right time to build them — the webhook handler already exists and will
-- start producing events the day purchasing opens.
--
-- Dry runs: renewal reminder wrote once and not twice for the same term; a
-- cancelled membership got none; BILLING_ISSUE and EXPIRATION each notified;
-- RENEWAL stayed silent.

update public.notification_automations set
  body_template = 'Your membership renews on {{renewal_date}}. Nothing to do — this is just a heads-up.',
  link_template = '/membership-settings'
where key = 'membership_renewing';

update public.notification_automations set
  body_template = 'We could not renew your membership. Update your payment method to keep your benefits.',
  link_template = '/membership-settings',
  wired = true
where key = 'membership_payment_failed';

update public.notification_automations set
  body_template = 'Your membership has ended. Renew any time to get your benefits back.',
  link_template = '/membership-settings',
  wired = true
where key = 'membership_expired';

create or replace function public.fn_notify_membership_store_event()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_key  text;
  v_copy record;
begin
  -- An event whose app_user_id did not resolve belongs to nobody we can tell.
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
          -- The store event id: RevenueCat retries, and the same webhook
          -- delivered twice must not notify twice.
          'membership-event/' || new.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_membership_store_event on public.membership_store_events;
create trigger trg_notify_membership_store_event
  after insert on public.membership_store_events
  for each row execute function public.fn_notify_membership_store_event();

-- ── Renewing soon ───────────────────────────────────────────────────────────
-- The one that needs a schedule: nothing happens before a renewal, there is
-- only the date already sitting on the row.

update public.notification_automations set
  timing = '{"days_before": 7, "send_local_hour": 10}'::jsonb,
  wired = true
where key = 'membership_renewing';

create or replace function public.send_membership_renewing()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a       public.notification_automations%rowtype;
  v_days  integer;
  v_hour  integer;
  r       record;
  v_copy  record;
  v_count integer := 0;
begin
  select * into a from public.notification_automations where key = 'membership_renewing';
  if not found or not a.enabled then
    return 0;
  end if;

  v_days := coalesce((a.timing ->> 'days_before')::int, 7);
  v_hour := coalesce((a.timing ->> 'send_local_hour')::int, 10);

  for r in
    select m.user_id, m.expires_at, m.id membership_id, m.term_seq,
           coalesce(p.timezone, 'UTC') tz
      from public.memberships m
      join public.profiles p on p.id = m.user_id
     where m.status = 'active'
       -- Only when it will actually charge them. Someone who has cancelled
       -- does not need reminding of a renewal that is not coming; they hear
       -- from membership_expired when the term ends.
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
            -- Once per TERM, so next year's renewal is announced again.
            'membership-renewing/' || r.membership_id || '/' || r.term_seq)
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.send_membership_renewing() from public, anon, authenticated;

select cron.schedule('membership-renewing', '0 * * * *',
                     $$select public.send_membership_renewing();$$);
