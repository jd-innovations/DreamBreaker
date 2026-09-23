-- Court reservations: confirmed, invited, cancelled, and the day-before
-- reminder. The last gap in the catalog — people book courts today and the app
-- tells them nothing at all.
--
-- ── Who hears what ──────────────────────────────────────────────────────────
--   confirmed  every confirmed player, organizer included: they all paid a
--              share, and the booking becoming real is what they were waiting
--              for.
--   cancelled  every confirmed player EXCEPT the organizer. The schema does
--              not record WHO cancelled, and the organizer is who normally
--              does; telling someone their own action happened is noise. A
--              facility-side cancellation therefore reaches the players but
--              not the organizer — the lesser of the two wrongs, and fixable
--              the day reservations record a cancelling actor.
--   invited    the invitee only.
--   reminder   every confirmed player, the evening before, in their own local
--              time.
--
-- ── Times are exact here ────────────────────────────────────────────────────
-- Unlike tournaments (a DATE plus a naive TIME), time_range is a tstzrange, so
-- lower(time_range) is a real instant. There is no timezone guesswork: it is
-- rendered in each recipient's own timezone, which is why the status copy is
-- rendered per recipient rather than once.
--
-- ── Links ───────────────────────────────────────────────────────────────────
-- /booking/<id> is a real deep-link root, so a tap opens the booking itself.
--
-- Dry runs on a cloned real booking: confirming notified both players with the
-- right local time; an invite reached the invitee naming the inviter; the
-- day-before reminder sent to both and nothing on a rerun; cancelling notified
-- the player and NOT the organizer.

update public.notification_automations set
  title_template = 'Court booked ✅',
  body_template  = '{{facility_name}} on {{event_date}} at {{start_time}}. See you there.',
  link_template  = '/booking/{{reservation_id}}',
  wired = true
where key = 'reservation_confirmed';

update public.notification_automations set
  title_template = 'Court time tomorrow',
  body_template  = '{{facility_name}} at {{start_time}}. Tap for the details.',
  link_template  = '/booking/{{reservation_id}}',
  timing = '{"days_before": 1, "send_local_hour": 17}'::jsonb,
  wired = true
where key = 'reservation_reminder';

update public.notification_automations set
  title_template = '{{inviter_name}} invited you 🏓',
  body_template  = '{{facility_name}}, {{event_date}} at {{start_time}}. Tap to join.',
  link_template  = '/booking/{{reservation_id}}',
  wired = true
where key = 'reservation_invite';

update public.notification_automations set
  title_template = 'Booking cancelled',
  body_template  = 'Your court at {{facility_name}} on {{event_date}} was cancelled. Any payment is refunded.',
  link_template  = '/booking/{{reservation_id}}',
  wired = true
where key = 'reservation_cancelled';

-- ── Confirmed / cancelled ───────────────────────────────────────────────────

create or replace function public.fn_notify_reservation_status()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_key   text;
  v_fac   text;
  v_start timestamptz;
begin
  if new.status = old.status then
    return new;
  end if;

  v_key := case new.status::text
             when 'confirmed' then 'reservation_confirmed'
             when 'cancelled' then 'reservation_cancelled'
             else null
           end;
  if v_key is null then
    return new;
  end if;

  select name into v_fac from public.facilities where id = new.facility_id;
  v_start := lower(new.time_range);

  -- Rendered per recipient: the date and time are shown in each player's own
  -- timezone.
  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  select rp.profile_id,
         v_key,
         coalesce(c.title, case when v_key = 'reservation_confirmed' then 'Court booked' else 'Booking cancelled' end),
         coalesce(c.body, 'Open the app for the details.'),
         coalesce(c.link, '/booking/' || new.id),
         v_key || '/' || new.id || '/' || rp.profile_id
    from public.reservation_players rp
    join public.profiles p on p.id = rp.profile_id
    cross join lateral private.render_automation(v_key, jsonb_build_object(
      'facility_name',  coalesce(v_fac, 'the facility'),
      'reservation_id', new.id::text,
      'event_date',     to_char(v_start at time zone coalesce(p.timezone, 'UTC'), 'FMDay, FMMonth FMDD'),
      'start_time',     to_char(v_start at time zone coalesce(p.timezone, 'UTC'), 'FMHH12:MI AM')
    )) c
   where rp.reservation_id = new.id
     and rp.status = 'confirmed'
     and rp.profile_id is not null
     and p.deleted_at is null
     -- On a cancellation the organizer is normally the one who did it.
     and (v_key <> 'reservation_cancelled' or rp.profile_id <> new.organizer_id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_reservation_status on public.reservations;
create trigger trg_notify_reservation_status
  after update of status on public.reservations
  for each row execute function public.fn_notify_reservation_status();

-- ── Invited ─────────────────────────────────────────────────────────────────

create or replace function public.fn_notify_reservation_invite()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  v_res   public.reservations;
  v_fac   text;
  v_who   text;
  v_start timestamptz;
  v_tz    text;
  v_copy  record;
begin
  if new.invitee_id is null or new.invitee_id = new.inviter_id then
    return new;
  end if;

  select * into v_res from public.reservations where id = new.reservation_id;
  if not found then
    return new;
  end if;

  select name into v_fac from public.facilities where id = v_res.facility_id;
  select full_name into v_who from public.profiles where id = new.inviter_id;
  select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = new.invitee_id;
  v_start := lower(v_res.time_range);

  select * into v_copy from private.render_automation('reservation_invite', jsonb_build_object(
    'inviter_name',   coalesce(v_who, 'Someone'),
    'facility_name',  coalesce(v_fac, 'a court'),
    'reservation_id', v_res.id::text,
    'event_date',     to_char(v_start at time zone v_tz, 'FMDay, FMMonth FMDD'),
    'start_time',     to_char(v_start at time zone v_tz, 'FMHH12:MI AM')
  ));

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (new.invitee_id, 'reservation_invite',
          coalesce(v_copy.title, coalesce(v_who, 'Someone') || ' invited you'),
          coalesce(v_copy.body, 'Tap to join the booking.'),
          coalesce(v_copy.link, '/booking/' || v_res.id),
          'reservation-invite/' || new.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_reservation_invite on public.reservation_invites;
create trigger trg_notify_reservation_invite
  after insert on public.reservation_invites
  for each row execute function public.fn_notify_reservation_invite();

-- ── Day-before reminder ─────────────────────────────────────────────────────

create or replace function public.send_reservation_reminders()
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
  select * into a from public.notification_automations where key = 'reservation_reminder';
  if not found or not a.enabled then
    return 0;
  end if;

  v_days := coalesce((a.timing ->> 'days_before')::int, 1);
  v_hour := coalesce((a.timing ->> 'send_local_hour')::int, 17);

  for r in
    select rp.profile_id, res.id reservation_id, res.facility_id,
           lower(res.time_range) starts_at,
           coalesce(p.timezone, 'UTC') tz,
           (select f.name from public.facilities f where f.id = res.facility_id) facility_name
      from public.reservations res
      join public.reservation_players rp on rp.reservation_id = res.id
      join public.profiles p on p.id = rp.profile_id
     where res.status::text = 'confirmed'
       and rp.status = 'confirmed'
       and rp.profile_id is not null
       and p.deleted_at is null
       and lower(res.time_range) > now()
       -- The session is `days_before` days away in the player's own reckoning,
       -- and their clock has passed the send hour.
       and (lower(res.time_range) at time zone coalesce(p.timezone, 'UTC'))::date
           = (now() at time zone coalesce(p.timezone, 'UTC'))::date + v_days
       and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC')))::int >= v_hour
       and not exists (
         select 1 from public.notifications n
          where n.idempotency_key = 'reservation-reminder/' || res.id || '/' || rp.profile_id
       )
  loop
    if private.automation_push_blocked_reason(r.profile_id, 'reservation_reminder')
       in ('quiet_hours', 'daily_cap', 'weekly_cap', 'throttled') then
      continue;
    end if;

    select * into v_copy from private.render_automation('reservation_reminder', jsonb_build_object(
      'facility_name',  coalesce(r.facility_name, 'the facility'),
      'reservation_id', r.reservation_id::text,
      'event_date',     to_char(r.starts_at at time zone r.tz, 'FMDay, FMMonth FMDD'),
      'start_time',     to_char(r.starts_at at time zone r.tz, 'FMHH12:MI AM')
    ));

    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (r.profile_id, 'reservation_reminder',
            coalesce(v_copy.title, 'Court time tomorrow'),
            coalesce(v_copy.body, 'You have a court booked tomorrow.'),
            coalesce(v_copy.link, '/booking/' || r.reservation_id),
            'reservation-reminder/' || r.reservation_id || '/' || r.profile_id)
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.send_reservation_reminders() from public, anon, authenticated;

select cron.schedule('reservation-reminders', '0 * * * *',
                     $$select public.send_reservation_reminders();$$);
