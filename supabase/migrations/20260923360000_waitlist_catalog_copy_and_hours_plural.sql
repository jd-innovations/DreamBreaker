-- Two fixes found by simulating the senders against real data.
--
-- 1. waitlist_spot_offered ignored the catalog, like registration_confirmed
--    did. promote_next_waitlisted hard-coded "A spot just opened up! / You
--    have 24 hours to complete payment for X." while the admin screen showed
--    "A spot opened up 🎉 / X has room for you. Claim it within N hours before
--    it moves on." Editing the copy did nothing.
--
--    My first audit MISSED this one: it matched `insert into
--    public.notifications` and this function writes `INSERT INTO
--    "public"."notifications"` with quoted identifiers. The corrected search
--    is kept here so the next audit does not repeat the mistake:
--
--      prosrc ~* 'insert\s+into\s+"?public"?\s*\.\s*"?notifications"?'
--
--    The 24 hours is now derived from waitlist_offer_expires_at rather than
--    written into the sentence, so changing the offer window cannot leave the
--    copy lying about it.
--
-- 2. "within 1 hours". Proven in a rolled-back simulation: a hold expiring in
--    one hour rendered "Finish registering for Futures Classic within 1 hours".
--    Three templates put a bare {{hours_left}} in front of a literal "hours".
--    Fixed with an {{hours_word}} variable, following the {{games_word}}
--    convention already used by games_near_you and inactive_return.
--
-- play_event_starting_soon gets the same treatment even though it is disabled
-- and unwired: leaving one of the three behind is how it comes back.
--
-- Verified after applying, in a rolled-back transaction against real rows:
--   "...within 10 hours or your spot goes to the next player."
--   "...within 1 hour or your spot goes to the next player."
--   "A spot opened up 🎉 / Futures Classic has room for you. Claim it within
--    24 hours before it moves on."
--   uncovered sample vars: none

update public.notification_automations
   set body_template = 'Finish registering for {{tournament_name}} within {{hours_left}} {{hours_word}} or your spot goes to the next player.'
 where key = 'hold_expiring';

update public.notification_automations
   set body_template = '{{tournament_name}} has room for you. Claim it within {{hours_left}} {{hours_word}} before it moves on.'
 where key = 'waitlist_spot_offered';

update public.notification_automations
   set title_template = 'Game in {{hours_left}} {{hours_word}}'
 where key = 'play_event_starting_soon';

-- The sample set must keep covering every variable, or the Test button renders
-- a literal {{hours_word}}. Verified by the anti-join in 20260923330000.
create or replace function private.automation_sample_vars()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'tournament_name', 'Sample Open (test)',
    'tournament_id',   '00000000-0000-0000-0000-000000000000',
    'hours_left',      '2',
    'hours_word',      'hours',
    'event_date',      to_char(now() + interval '7 days', 'FMDay, FMMonth FMDD'),
    'venue_name',      'Sample Courts',
    'checkin_time',    '8:00 AM',
    'reason',          'The venue could not be confirmed.',
    'spots_left',      '2',
    'closes_at',       'Friday',
    'distance',        '8',
    'facility_name',   'Sample Courts',
    'start_time',      '6:30 PM',
    'reservation_id',  '00000000-0000-0000-0000-000000000000',
    'coach_name',      'Sample Coach',
    'item_name',       'Sample Lesson (test)',
    'item_id',         '00000000-0000-0000-0000-000000000000',
    'expiry_date',     to_char(now() + interval '14 days', 'FMMonth FMDD'),
    'amount',          '$25.00',
    'renewal_date',    to_char(now() + interval '30 days', 'FMMonth FMDD'),
    'player_name',     'Sample Player',
    'inviter_name',    'Sample Player',
    'author_name',     'Sample Player',
    'recorder_name',   'Sample Player',
    'event_name',      'Sample Game (test)',
    'event_id',        '00000000-0000-0000-0000-000000000000',
    'group_name',      'Sample Group (test)',
    'group_id',        '00000000-0000-0000-0000-000000000000',
    'post_preview',    'Anyone up for doubles on Saturday?',
    'rating',          '3.8',
    'direction',       'up',
    'change',          '0.2',
    'games',           '5',
    'count',           '3',
    'games_word',      'games',
    'message_preview', 'Thanks for reaching out — here is what we found.',
    'conversation_id', '00000000-0000-0000-0000-000000000000',
    'subject_label',   'Sample Coach',
    'token',           'sample-token-test',
    'deal_title',      'Sample Deal (test)',
    'deal_summary',    '20% off your next lesson',
    'ends_at',         'tonight'
  );
$$;

create or replace function public.send_hold_expiring_reminders()
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  a        public.notification_automations%rowtype;
  offsets  integer[];
  h        integer;
  i        integer;
  v_floor  integer;
  v_hours  integer;
  r        record;
  v_copy   record;
  v_count  integer := 0;
begin
  select * into a from public.notification_automations where key = 'hold_expiring';
  if not found or not a.enabled then
    return 0;
  end if;

  select coalesce(array_agg(value::integer order by value::integer desc), array[24, 2])
    into offsets
    from jsonb_array_elements_text(coalesce(a.timing -> 'offsets_hours', '[24,2]'::jsonb)) value;

  for i in 1 .. array_length(offsets, 1) loop
    h := offsets[i];
    -- Each offset claims only down to the next smaller one, so a single hold
    -- fires one band and not every band at once.
    v_floor := coalesce(offsets[i + 1], 0);

    for r in
      select reg.id, reg.player_id, reg.tournament_id, reg.hold_expires_at, t.name tournament_name
        from public.registrations reg
        join public.tournaments t on t.id = reg.tournament_id
       where reg.status = 'held'
         and reg.player_id is not null
         and reg.hold_expires_at is not null
         and reg.hold_expires_at >  now() + make_interval(hours => v_floor)
         and reg.hold_expires_at <= now() + make_interval(hours => h)
    loop
      v_hours := ceil(extract(epoch from (r.hold_expires_at - now())) / 3600.0)::integer;

      select * into v_copy from private.render_automation(
        'hold_expiring',
        jsonb_build_object(
          'tournament_name', r.tournament_name,
          'tournament_id',   r.tournament_id::text,
          'hours_left',      v_hours::text,
          'hours_word',      case when v_hours = 1 then 'hour' else 'hours' end
        )
      );

      insert into public.notifications (user_id, type, title, body, link, idempotency_key)
      values (
        r.player_id,
        'hold_expiring',
        coalesce(v_copy.title, 'Your spot is on hold'),
        coalesce(v_copy.body,  'Finish registering before your hold ends.'),
        coalesce(v_copy.link,  '/tournament/' || r.tournament_id),
        'hold-expiring/' || r.id || '/' || h
      )
      on conflict (idempotency_key) where idempotency_key is not null do nothing;

      if found then v_count := v_count + 1; end if;
    end loop;
  end loop;

  return v_count;
end;
$function$;

create or replace function public.promote_next_waitlisted(p_tournament_id uuid)
returns table(registration_id uuid, player_id uuid, full_name text, email text, offer_expires_at timestamp with time zone)
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_reg    record;
  v_expiry timestamptz := now() + interval '24 hours';
  v_name   text;
  v_hours  integer;
  v_copy   record;
begin
  select r.id, r.player_id
    into v_reg
    from "public"."registrations" r
   where r.tournament_id = p_tournament_id
     and r.status = 'waitlisted'
   order by r.waitlist_position nulls last, r.created_at
   limit 1
     for update skip locked;

  if not found then
    return;
  end if;

  update "public"."registrations"
     set status = 'waitlist_offered',
         waitlist_offer_expires_at = v_expiry,
         updated_at = now()
   where id = v_reg.id;

  select t.name into v_name from "public"."tournaments" t where t.id = p_tournament_id;

  if v_reg.player_id is not null then
    -- Derived from the expiry that was just written, so the sentence cannot
    -- disagree with the deadline the way a hard-coded "24 hours" could.
    v_hours := greatest(1, ceil(extract(epoch from (v_expiry - now())) / 3600.0)::integer);

    select * into v_copy from private.render_automation(
      'waitlist_spot_offered',
      jsonb_build_object(
        'tournament_name', coalesce(v_name, 'this tournament'),
        'tournament_id',   p_tournament_id::text,
        'hours_left',      v_hours::text,
        'hours_word',      case when v_hours = 1 then 'hour' else 'hours' end
      ));

    insert into "public"."notifications" (user_id, type, title, body, link)
    values (
      v_reg.player_id,
      'waitlist_spot_offered',
      coalesce(v_copy.title, 'A spot opened up'),
      coalesce(v_copy.body,  'A spot opened up in ' || coalesce(v_name, 'this tournament') || '.'),
      coalesce(v_copy.link,  '/tournament/' || p_tournament_id)
    );
  end if;

  return query
    select v_reg.id,
           v_reg.player_id,
           p.full_name,
           p.email,
           v_expiry
      from (select 1) _
      left join "public"."profiles" p on p.id = v_reg.player_id;
end;
$function$;
