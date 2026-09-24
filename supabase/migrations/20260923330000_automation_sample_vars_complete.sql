-- Complete the sample variables the "Send me a test" button renders with.
--
-- The set covered 7 variables while the 39 catalogued automations reference
-- 41. So a test send for roughly two thirds of them arrived on the device
-- reading literally "{{facility_name}} at {{start_time}}", with a deep link of
-- "/booking/{{reservation_id}}" that resolves to nothing. The button looked
-- like it worked; what it proved was only that a push could be delivered.
--
-- PRODUCTION WAS NEVER AFFECTED. Every real sender builds its own jsonb and
-- passes it to private.render_automation — see
-- 20260923240000_reservation_notifications.sql, which supplies facility_name,
-- start_time and the rest at the call site. This function is reached only by
-- admin_test_automation. Checked before changing it.
--
-- Ids are the all-zero uuid so a rendered link is at least well FORMED and the
-- app's deep-link parser is genuinely exercised; it will land on a "not found"
-- rather than fail to parse, which is the honest outcome for sample data.
-- Every human-readable value carries "(test)" or an obviously fake name, so a
-- test notification can never be mistaken for a real one.

create or replace function private.automation_sample_vars()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    -- Tournaments (the original seven)
    'tournament_name', 'Sample Open (test)',
    'tournament_id',   '00000000-0000-0000-0000-000000000000',
    'hours_left',      '2',
    'event_date',      to_char(now() + interval '7 days', 'FMDay, FMMonth FMDD'),
    'venue_name',      'Sample Courts',
    'checkin_time',    '8:00 AM',
    'reason',          'The venue could not be confirmed.',
    'spots_left',      '2',
    'closes_at',       'Friday',
    'distance',        '8',
    -- Court reservations
    'facility_name',   'Sample Courts',
    'start_time',      '6:30 PM',
    'reservation_id',  '00000000-0000-0000-0000-000000000000',
    -- Coaching and the wallet
    'coach_name',      'Sample Coach',
    'item_name',       'Sample Lesson (test)',
    'item_id',         '00000000-0000-0000-0000-000000000000',
    'expiry_date',     to_char(now() + interval '14 days', 'FMMonth FMDD'),
    'amount',          '$25.00',
    'renewal_date',    to_char(now() + interval '30 days', 'FMMonth FMDD'),
    -- People and play
    'player_name',     'Sample Player',
    'inviter_name',    'Sample Player',
    'author_name',     'Sample Player',
    'recorder_name',   'Sample Player',
    'event_name',      'Sample Game (test)',
    'event_id',        '00000000-0000-0000-0000-000000000000',
    -- Groups
    'group_name',      'Sample Group (test)',
    'group_id',        '00000000-0000-0000-0000-000000000000',
    'post_preview',    'Anyone up for doubles on Saturday?',
    -- Rating
    'rating',          '3.8',
    'direction',       'up',
    'change',          '0.2',
    'games',           '5',
    -- Discovery and win-back
    'count',           '3',
    'games_word',      'games',
    -- Support, reviews, deals
    'message_preview', 'Thanks for reaching out — here is what we found.',
    'conversation_id', '00000000-0000-0000-0000-000000000000',
    'subject_label',   'Sample Coach',
    'token',           'sample-token-test',
    'deal_title',      'Sample Deal (test)',
    'deal_summary',    '20% off your next lesson',
    'ends_at',         'tonight'
  );
$$;

comment on function private.automation_sample_vars() is
  'Sample values for the admin "Send me a test" button only. Real senders pass '
  'their own variables to private.render_automation. Every variable used by any '
  'row in notification_automations must have a key here, or the test renders '
  'a literal {{token}} — verify with the anti-join in '
  '20260923330000_automation_sample_vars_complete.sql.';

-- The check that keeps this honest. Run it after adding any automation:
--
--   with tok as (
--     select a.key, m[1] var
--     from public.notification_automations a
--     cross join lateral regexp_matches(
--       coalesce(a.title_template,'')||' '||coalesce(a.body_template,'')||' '
--       ||coalesce(a.link_template,''), '\{\{(\w+)\}\}', 'g') m
--   ), sample as (select jsonb_object_keys(private.automation_sample_vars()) k)
--   select distinct t.var from tok t
--    where not exists (select 1 from sample s where s.k = t.var);
--
-- Zero rows is the passing result.
