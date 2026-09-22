-- Phase A.3b: the day-before event reminder, and the `send_local_hour` timing
-- shape the admin editor exposes alongside offsets.
--
-- ── Why not "24 hours before" ───────────────────────────────────────────────
--
-- tournaments.event_date is a DATE and start_time is TIME WITHOUT TIME ZONE:
-- an event has no timezone anywhere in the schema, and facilities carry none
-- either. "24 hours before 8:00" therefore has no well-defined instant, and
-- computing it in the database's timezone would drift by hours for a player in
-- another state.
--
-- So the rule is the one a person would actually describe: the EVENING BEFORE,
-- in the player's own local time. The job runs hourly and sends to each player
-- whose local clock has reached the configured hour on the day before their
-- event. Players without a timezone are treated as UTC, the same fallback the
-- dispatcher uses.
--
--   timing: {"days_before": 1, "send_local_hour": 17}
--
-- Both are editable in /admin/notifications. A whole day ahead is `days_before`
-- 2, a morning-of nudge is 0.
--
-- ── Dedup ───────────────────────────────────────────────────────────────────
-- One notification per (registration, event date). The event date is in the
-- key rather than a timestamp, so a director moving the event produces exactly
-- one new reminder rather than a second copy of the old one.

update public.notification_automations
   set timing = '{"days_before": 1, "send_local_hour": 17}'::jsonb,
       description = 'Reminds registered players the evening before an event, in their own local time. Events carry no timezone, so this is a local-hour rule rather than an hours-before offset.',
       wired = true
 where key = 'event_reminder';

create or replace function public.send_event_reminders()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  a           public.notification_automations%rowtype;
  v_days      integer;
  v_hour      integer;
  r           record;
  v_copy      record;
  v_checkin   text;
  v_count     integer := 0;
begin
  select * into a from public.notification_automations where key = 'event_reminder';
  if not found or not a.enabled then
    return 0;
  end if;

  v_days := coalesce((a.timing ->> 'days_before')::int, 1);
  v_hour := coalesce((a.timing ->> 'send_local_hour')::int, 17);

  for r in
    select reg.id, reg.player_id, reg.tournament_id,
           t.name, t.event_date, t.start_time, t.venue_name, t.checkin_opens_at,
           p.email, p.full_name,
           coalesce(p.timezone, 'UTC') tz
      from public.registrations reg
      join public.tournaments t on t.id = reg.tournament_id
      join public.profiles p    on p.id = reg.player_id
     where reg.status in ('registered', 'checked_in')
       and reg.player_id is not null
       and t.status <> 'cancelled'
       -- The event is `days_before` days away in the PLAYER'S local reckoning,
       -- and their local clock has passed the send hour.
       and t.event_date = (now() at time zone coalesce(p.timezone, 'UTC'))::date + v_days
       and extract(hour from (now() at time zone coalesce(p.timezone, 'UTC'))) >= v_hour
  loop
    -- Check-in time if the director set one, otherwise the start time, and
    -- "soon" if neither exists — never an empty gap in the sentence.
    v_checkin := coalesce(
      to_char(r.checkin_opens_at, 'FMHH12:MI AM'),
      to_char(r.start_time, 'FMHH12:MI AM'),
      'soon'
    );

    select * into v_copy from private.render_automation(
      'event_reminder',
      jsonb_build_object(
        'tournament_name', r.name,
        'tournament_id',   r.tournament_id::text,
        'event_date',      to_char(r.event_date, 'FMDay, FMMonth FMDD'),
        'venue_name',      coalesce(r.venue_name, 'the venue'),
        'checkin_time',    v_checkin
      )
    );

    insert into public.notifications (user_id, type, title, body, link, idempotency_key)
    values (
      r.player_id,
      'event_reminder',
      coalesce(v_copy.title, 'Tomorrow: ' || r.name),
      coalesce(v_copy.body,  'See you on the court.'),
      coalesce(v_copy.link,  '/tournament/' || r.tournament_id),
      'event-reminder/' || r.id || '/' || r.event_date
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    -- Only email when the notification was actually new: on conflict means a
    -- reminder already went out for this event date.
    if found then
      v_count := v_count + 1;

      if 'email' = any (a.channels) and r.email is not null then
        perform public.fn_send_transactional_email(jsonb_build_object(
          'to', r.email,
          'templateKey', 'event_reminder',
          'variables', jsonb_build_object(
            'first_name',      coalesce(nullif(split_part(r.full_name, ' ', 1), ''), 'there'),
            'tournament_name', r.name,
            'event_date',      to_char(r.event_date, 'FMDay, FMMonth FMDD'),
            'venue_name',      coalesce(r.venue_name, 'the venue'),
            'link',            'https://pickleballapp.app/tournaments/' || r.tournament_id
          ),
          'idempotencyKey', 'event-reminder/' || r.id || '/' || r.event_date
        ));
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.send_event_reminders() is
  'Day-before event reminder, sent at the player''s own local hour because '
  'tournaments carry no timezone. No-op while the event_reminder automation '
  'is disabled.';

revoke all on function public.send_event_reminders() from public, anon, authenticated;

-- Hourly, not every 15 minutes: the rule has one-hour resolution by design, so
-- a quarter-hourly run would do the same work four times for nothing.
select cron.schedule('event-reminders', '0 * * * *',
                     $$select public.send_event_reminders();$$);
