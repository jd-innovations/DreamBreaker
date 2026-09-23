-- Wallet benefits about to expire unused.
--
-- ── The duplicate this avoids ───────────────────────────────────────────────
-- Coaching vouchers ARE wallet items (type = 'coach_voucher'), and they
-- already have their own reminder against the entitlement, which knows about
-- remaining redemptions. Without the exclusion below a buyer would get two
-- notifications about one voucher, on different schedules, worded differently.
-- The entitlement is the better source, so it wins and this one skips them.
--
-- Everything else in the wallet — admin grants, membership benefits, partner
-- offers — has no other sender at all.
--
-- ── Bands, most urgent first ────────────────────────────────────────────────
-- Each day in the list claims down to the next smaller one, so an item 20 days
-- out gets one reminder rather than three. The list is walked ASCENDING, and
-- that direction matters: a dry run with the cap at one push a day showed the
-- 10-day reminder going out while the 2-day one — the benefit about to be lost
-- — was deferred. Urgent first means the cap drops the relaxed reminder
-- instead, and it arrives tomorrow.
--
-- The seeded 168h throttle is removed for the same reason it was on the
-- coaching reminder: a per-user throttle silences the second of two items
-- expiring in one week, and the per-item, per-band key is the real limit.

update public.notification_automations set
  timing = '{"days_before_list": [14, 3], "send_local_hour": 10}'::jsonb,
  body_template = '{{item_name}} expires {{expiry_date}}. Use it before it goes.',
  link_template = '/wallet',
  throttle_hours = null,
  wired = true
where key = 'wallet_item_expiring';

create or replace function public.send_wallet_item_expiring()
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
  select * into a from public.notification_automations where key = 'wallet_item_expiring';
  if not found or not a.enabled then
    return 0;
  end if;

  v_hour := coalesce((a.timing ->> 'send_local_hour')::int, 10);

  -- ASCENDING: most urgent band first, so a cap drops the relaxed reminder.
  select coalesce(array_agg(value::integer order by value::integer), array[3, 14])
    into days
    from jsonb_array_elements_text(
           coalesce(a.timing -> 'days_before_list',
                    case when a.timing ? 'days_before'
                         then jsonb_build_array(a.timing -> 'days_before')
                         else '[14,3]'::jsonb end)) value;

  for i in 1 .. array_length(days, 1) loop
    d := days[i];
    -- The floor is the PREVIOUS (smaller) entry, since the list ascends.
    v_floor := coalesce(days[i - 1], 0);

    for r in
      select w.id item_id, w.user_id, w.title, w.expires_at,
             coalesce(p.timezone, 'UTC') tz
        from public.wallet_items w
        join public.profiles p on p.id = w.user_id
       where w.status in ('available', 'active')
         and w.revoked_at is null
         and w.redeemed_at is null
         and w.expires_at is not null
         and w.expires_at >  now() + make_interval(days => v_floor)
         and w.expires_at <= now() + make_interval(days => d)
         -- Coaching vouchers have their own, better-informed reminder.
         and w.type is distinct from 'coach_voucher'
         and p.deleted_at is null
         and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC')))::int >= v_hour
         and not exists (
           select 1 from public.notifications n
            where n.idempotency_key = 'wallet-expiring/' || w.id || '/' || d
         )
    loop
      if private.automation_push_blocked_reason(r.user_id, 'wallet_item_expiring')
         in ('quiet_hours', 'daily_cap', 'weekly_cap', 'throttled') then
        continue;
      end if;

      select * into v_copy from private.render_automation('wallet_item_expiring', jsonb_build_object(
        'item_name',   r.title,
        'item_id',     r.item_id::text,
        'expiry_date', to_char(r.expires_at at time zone r.tz, 'FMDay, FMMonth FMDD')
      ));

      insert into public.notifications (user_id, type, title, body, link, idempotency_key)
      values (r.user_id, 'wallet_item_expiring',
              coalesce(v_copy.title, 'Expiring soon'),
              coalesce(v_copy.body, r.title || ' expires soon.'),
              coalesce(v_copy.link, '/wallet'),
              'wallet-expiring/' || r.item_id || '/' || d)
      on conflict (idempotency_key) where idempotency_key is not null do nothing;

      if found then v_count := v_count + 1; end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.send_wallet_item_expiring() from public, anon, authenticated;

select cron.schedule('wallet-item-expiring', '0 * * * *',
                     $$select public.send_wallet_item_expiring();$$);
