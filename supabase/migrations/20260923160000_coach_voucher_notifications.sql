-- Coaching vouchers: bought, about to expire, refunded.
--
-- ── The reminder schedule already existed ───────────────────────────────────
-- platform_settings.coach_marketplace_reminder_days has held '30,15,7,3,1'
-- since Coach Marketplace Phase 1 (20260810004134) and NOTHING has ever read
-- it — stored intent, exactly like the notification toggles that turned out to
-- be component state. Those days are the right schedule, so the automation
-- adopts them as its own timing and the old setting's description now says
-- where the live value lives. Two settings both claiming to drive one
-- behaviour is how the toggle problem happened in the first place.
--
-- ── coach_session_booked stays unwired ──────────────────────────────────────
-- There is no scheduling anywhere in the schema: coach_voucher_redemptions
-- records a lesson being USED, not booked. Wiring it to "Session confirmed"
-- would confirm a booking for something that already happened. It stays
-- catalogued and off until sessions are scheduled somewhere real.
--
-- Dry runs against real rows: a new entitlement notified its buyer; a buyer
-- holding vouchers 20 and 2 days out got the 30-day and 3-day reminders and
-- nothing on a second run; a completed refund reached the purchase's actual
-- buyer with the right amount and offer title.

update public.platform_settings
   set description = 'Superseded: the live schedule is the coach_voucher_expiring automation''s timing in /admin/notifications. Kept for reference.'
 where key = 'coach_marketplace_reminder_days';

update public.notification_automations set
  timing = '{"days_before_list": [30, 15, 7, 3, 1], "send_local_hour": 10}'::jsonb,
  body_template = 'Your session with {{coach_name}} expires {{expiry_date}}. Book it before it goes.',
  link_template = '/wallet',
  wired = true
where key = 'coach_voucher_expiring';

update public.notification_automations set
  body_template = 'Your voucher is in your wallet. Tap to book your session with {{coach_name}}.',
  link_template = '/wallet',
  wired = true
where key = 'coach_voucher_purchased';

update public.notification_automations set
  body_template = '{{amount}} for {{item_name}} is on its way back to your card.',
  link_template = '/wallet',
  wired = true
where key = 'refund_processed';

-- ── Bought ──────────────────────────────────────────────────────────────────
-- On the entitlement, not the purchase: the entitlement is the thing the buyer
-- can actually use, and it exists only once payment has settled.

create or replace function public.fn_notify_coach_voucher_purchased()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_coach text;
  v_copy  record;
begin
  if new.buyer_id is null then
    return new;
  end if;

  select full_name into v_coach from public.profiles where id = new.coach_id;

  select * into v_copy from private.render_automation('coach_voucher_purchased', jsonb_build_object(
    'coach_name', coalesce(v_coach, 'your coach')
  ));

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (new.buyer_id, 'coach_voucher_purchased',
          coalesce(v_copy.title, 'Coaching booked'),
          coalesce(v_copy.body, 'Your voucher is in your wallet.'),
          coalesce(v_copy.link, '/wallet'),
          'coach-voucher/' || new.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_coach_voucher_purchased on public.coach_voucher_entitlements;
create trigger trg_notify_coach_voucher_purchased
  after insert on public.coach_voucher_entitlements
  for each row execute function public.fn_notify_coach_voucher_purchased();

-- ── About to expire ─────────────────────────────────────────────────────────
-- Money already spent, about to be wasted: the strongest reason to notify
-- anyone. Each day in the list claims the band down to the next smaller one,
-- so a voucher with 20 days left gets the 15-day reminder rather than the
-- 30-day one as well.

create or replace function public.send_coach_voucher_expiring()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a       public.notification_automations%rowtype;
  days    integer[];
  i       integer;
  d       integer;
  v_floor integer;
  v_hour  integer;
  r       record;
  v_copy  record;
  v_count integer := 0;
begin
  select * into a from public.notification_automations where key = 'coach_voucher_expiring';
  if not found or not a.enabled then
    return 0;
  end if;

  v_hour := coalesce((a.timing ->> 'send_local_hour')::int, 10);

  select coalesce(array_agg(value::integer order by value::integer desc), array[30, 15, 7, 3, 1])
    into days
    from jsonb_array_elements_text(coalesce(a.timing -> 'days_before_list', '[30,15,7,3,1]'::jsonb)) value;

  for i in 1 .. array_length(days, 1) loop
    d := days[i];
    v_floor := coalesce(days[i + 1], 0);

    for r in
      select e.id entitlement_id, e.buyer_id, e.expires_at, e.coach_id,
             coalesce(p.timezone, 'UTC') tz,
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

      if found then v_count := v_count + 1; end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.send_coach_voucher_expiring() from public, anon, authenticated;

select cron.schedule('coach-voucher-expiring', '0 * * * *',
                     $$select public.send_coach_voucher_expiring();$$);

-- ── Refunded ────────────────────────────────────────────────────────────────
-- Only once the money has actually moved. A refund that is merely requested
-- tells the buyer nothing they can rely on; the Stripe webhook flips it to
-- completed, and that is the moment worth announcing.

create or replace function public.fn_notify_coach_refund()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_buyer uuid;
  v_title text;
  v_copy  record;
begin
  if new.status <> 'completed' or (tg_op = 'UPDATE' and old.status = 'completed') then
    return new;
  end if;

  select buyer_id, offer_title into v_buyer, v_title
    from public.coach_offer_purchases where id = new.purchase_id;

  if v_buyer is null then
    return new;
  end if;

  select * into v_copy from private.render_automation('refund_processed', jsonb_build_object(
    'amount',    '$' || to_char(new.amount_cents / 100.0, 'FM999999990.00'),
    'item_name', coalesce(v_title, 'your purchase')
  ));

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (v_buyer, 'refund_processed',
          coalesce(v_copy.title, 'Refund on its way'),
          coalesce(v_copy.body, 'Your refund has been processed.'),
          coalesce(v_copy.link, '/wallet'),
          'coach-refund/' || new.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_coach_refund on public.coach_refunds;
create trigger trg_notify_coach_refund
  after insert or update of status on public.coach_refunds
  for each row execute function public.fn_notify_coach_refund();
