-- The coaching expiry reminder walks its bands MOST URGENT FIRST, matching
-- the change made to wallet_item_expiring in 20260923170000.
--
-- That one was walked longest-first (30, 15, 7, 3, 1) because that is how the
-- days read when you write them down. A dry run of the wallet version showed
-- what it costs: with the cap at one push a day, the 10-day reminder went out
-- and the 2-day one was deferred — exactly backwards. coach_voucher_expiring
-- is category 'critical' and so exempt from the caps today, but a later
-- re-categorisation must not quietly reintroduce the bug.
--
-- Band boundaries are unchanged: each day still claims down to the next
-- smaller one, so no voucher is mentioned twice for one band.

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

  select coalesce(array_agg(value::integer order by value::integer), array[1, 3, 7, 15, 30])
    into days
    from jsonb_array_elements_text(coalesce(a.timing -> 'days_before_list', '[30,15,7,3,1]'::jsonb)) value;

  for i in 1 .. array_length(days, 1) loop
    d := days[i];
    v_floor := coalesce(days[i - 1], 0);

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
