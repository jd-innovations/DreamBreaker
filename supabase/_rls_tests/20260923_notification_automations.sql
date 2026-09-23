-- Notification automation regression tests.
--
-- Run against a LOCAL database -- it seeds rows and rolls nothing back:
--
--   supabase db reset --local
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/_rls_tests/20260923_notification_automations.sql
--
-- Same style as 20260922_push_broadcast.sql: a temp results table, a
-- pg_temp.ok() recorder, impersonation through request.jwt.claims + the
-- Postgres role, a PASS/FAIL summary, and a non-zero exit on any failure.
--
-- ── Why this suite exists ───────────────────────────────────────────────────
-- 35 automations were built on 2026-09-22/23 and verified only by rolled-back
-- dry runs, by hand, one at a time. The rules they all share —
-- private.automation_push_blocked_reason — decide whether someone is woken at
-- 3am, whether a marketing push respects the daily cap, and whether a user's
-- own preference is honoured. Every one of those fails SILENTLY: the wrong
-- answer sends a notification nobody sees a bug in, or sends nothing at all.
-- This pins the behaviour so a later change has to break a test to break a
-- user's night.
--
-- It deliberately does NOT test individual senders (does the hold reminder
-- pick the right registration?). Those are many, and each was dry-run against
-- real rows. What is shared, and therefore what a regression would break
-- everywhere at once, is the gate, the renderer and the dispatch trigger.
--
-- Fixtures use an 'na…' id prefix and a 'natest' token so assertions are about
-- the fixture rows only — the suite gives the same answers on a database that
-- also holds real users and real automations. It was first run that way,
-- inside a rolled-back transaction against production, on 2026-09-23.
--
-- Fixture actors:
--   …a1  player, iOS token, all preferences on
--   …a2  player, iOS token, notif_tournaments OFF
--   …a3  player, NO token
--   …a4  admin
--
-- Fixture automations (removed with the fixtures on a local run):
--   na_critical    category critical, push+in_app, wired+enabled
--   na_marketing   category marketing, push+in_app, wired+enabled
--   na_prefbound   critical but bound to notif_tournaments
--   na_unwired     wired = false

\set ON_ERROR_STOP on

create temp table na_results (
  test_name text primary key,
  passed    boolean not null,
  detail    text
) on commit preserve rows;

create or replace function pg_temp.ok(p_name text, p_passed boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into na_results(test_name, passed, detail)
  values (p_name, coalesce(p_passed, false), p_detail)
  on conflict (test_name) do update set passed = excluded.passed, detail = excluded.detail;
end;
$$;

create or replace function pg_temp.as_user(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.as_postgres()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- -1 = no grant at all; otherwise the number of rows the actor can see.
create or replace function pg_temp.visible(p_sql text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) _q', p_sql) into n;
  return n;
exception when insufficient_privilege then
  return -1;
end;
$$;

-- The error message a statement raises, or null if it succeeded.
create or replace function pg_temp.raises(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────

do $$
declare
  a1 uuid := '00000000-0000-4000-8000-0000000000a1';
  a2 uuid := '00000000-0000-4000-8000-0000000000a2';
  a3 uuid := '00000000-0000-4000-8000-0000000000a3';
  a4 uuid := '00000000-0000-4000-8000-0000000000a4';
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, aud, role)
  values (a1, 'na1@example.test', '', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
         (a2, 'na2@example.test', '', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
         (a3, 'na3@example.test', '', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated'),
         (a4, 'na4@example.test', '', now(), now(), now(), '{}', '{}', 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  update public.profiles set full_name = 'NA One',   role = 'player', timezone = 'America/New_York' where id = a1;
  update public.profiles set full_name = 'NA Two',   role = 'player', timezone = 'America/New_York',
                             notif_tournaments = false where id = a2;
  update public.profiles set full_name = 'NA Three', role = 'player', timezone = 'America/New_York' where id = a3;
  update public.profiles set full_name = 'NA Four',  role = 'admin',  timezone = 'America/New_York' where id = a4;

  insert into public.push_tokens (user_id, expo_push_token, platform, app_version, tap_events_supported)
  values (a1, 'ExponentPushToken[natest-a1]', 'ios', '1.0.0', true),
         (a2, 'ExponentPushToken[natest-a2]', 'ios', '1.0.0', true),
         (a4, 'ExponentPushToken[natest-a4]', 'ios', '1.0.0', true)
  on conflict (user_id, expo_push_token) do nothing;

  insert into public.notification_automations
    (key, name, category, pref_column, channels, title_template, body_template, link_template,
     timing, throttle_hours, enabled, wired, sort_order)
  values
    ('na_critical',  'NA critical',  'critical',  null, array['push','in_app'],
     'Critical {{thing}}', 'Body {{thing}}', '/tournament/{{id}}', '{}'::jsonb, null, true, true, 9000),
    ('na_marketing', 'NA marketing', 'marketing', null, array['push','in_app'],
     'Marketing', 'Body', '/community', '{}'::jsonb, null, true, true, 9001),
    ('na_prefbound', 'NA pref',      'critical',  'notif_tournaments', array['push','in_app'],
     'Pref', 'Body', null, '{}'::jsonb, null, true, true, 9002),
    ('na_inapp',     'NA in-app',    'critical',  null, array['in_app'],
     'InApp', 'Body', null, '{}'::jsonb, null, true, true, 9003),
    ('na_throttled', 'NA throttled', 'critical',  null, array['push','in_app'],
     'Throttled', 'Body', null, '{}'::jsonb, 24, true, true, 9004),
    ('na_unwired',   'NA unwired',   'critical',  null, array['push','in_app'],
     'Unwired', 'Body', null, '{}'::jsonb, null, false, false, 9005)
  on conflict (key) do nothing;
end $$;

-- ── The gate: private.automation_push_blocked_reason ────────────────────────

do $$
declare
  a1 uuid := '00000000-0000-4000-8000-0000000000a1';
  a2 uuid := '00000000-0000-4000-8000-0000000000a2';
  a3 uuid := '00000000-0000-4000-8000-0000000000a3';
  v_hour int;
begin
  select extract(hour from (now() at time zone 'America/New_York'))::int into v_hour;

  -- Quiet hours parked well away from "now" for the baseline tests.
  update public.platform_settings set value = ((v_hour + 4) % 24)::text where key = 'push_quiet_hours_start';
  update public.platform_settings set value = ((v_hour + 5) % 24)::text where key = 'push_quiet_hours_end';
  update public.platform_settings set value = '50' where key = 'push_marketing_max_per_day';
  update public.platform_settings set value = '99' where key = 'push_marketing_max_per_week';
  update public.platform_settings set value = 'true' where key = 'push_automations_enabled';
  delete from public.notification_push_log where user_id in (a1, a2, a3);

  perform pg_temp.ok('gate.allows_critical',
    private.automation_push_blocked_reason(a1, 'na_critical') is null,
    coalesce(private.automation_push_blocked_reason(a1, 'na_critical'), 'null'));

  perform pg_temp.ok('gate.allows_marketing_outside_quiet_hours',
    private.automation_push_blocked_reason(a1, 'na_marketing') is null,
    coalesce(private.automation_push_blocked_reason(a1, 'na_marketing'), 'null'));

  perform pg_temp.ok('gate.unknown_key',
    private.automation_push_blocked_reason(a1, 'na_does_not_exist') = 'no_such_automation');

  perform pg_temp.ok('gate.no_device',
    private.automation_push_blocked_reason(a3, 'na_critical') = 'no_device');

  perform pg_temp.ok('gate.push_channel_off',
    private.automation_push_blocked_reason(a1, 'na_inapp') = 'push_channel_off');

  -- A user's own preference outranks category: critical is exempt from the
  -- marketing machinery, never from a switch the user set.
  perform pg_temp.ok('gate.user_pref_off_beats_critical',
    private.automation_push_blocked_reason(a2, 'na_prefbound') = 'user_pref_off');

  perform pg_temp.ok('gate.disabled_automation',
    (select private.automation_push_blocked_reason(a1, 'na_unwired')) = 'automation_disabled');

  -- Throttle applies to every category, including critical.
  insert into public.notification_push_log (user_id, automation_key, category)
  values (a1, 'na_throttled', 'critical');
  perform pg_temp.ok('gate.throttled_applies_to_critical',
    private.automation_push_blocked_reason(a1, 'na_throttled') = 'throttled');

  -- Quiet hours: marketing is held, critical is not.
  update public.platform_settings set value = v_hour::text            where key = 'push_quiet_hours_start';
  update public.platform_settings set value = ((v_hour + 1) % 24)::text where key = 'push_quiet_hours_end';
  perform pg_temp.ok('gate.quiet_hours_blocks_marketing',
    private.automation_push_blocked_reason(a1, 'na_marketing') = 'quiet_hours');
  perform pg_temp.ok('gate.quiet_hours_exempts_critical',
    private.automation_push_blocked_reason(a1, 'na_critical') is null);

  -- A window that does NOT wrap midnight must behave the same way.
  update public.platform_settings set value = ((v_hour + 23) % 24)::text where key = 'push_quiet_hours_start';
  update public.platform_settings set value = ((v_hour + 1)  % 24)::text where key = 'push_quiet_hours_end';
  perform pg_temp.ok('gate.quiet_hours_non_wrapping_window',
    private.automation_push_blocked_reason(a1, 'na_marketing') = 'quiet_hours');

  -- Out of quiet hours again for the cap tests.
  update public.platform_settings set value = ((v_hour + 4) % 24)::text where key = 'push_quiet_hours_start';
  update public.platform_settings set value = ((v_hour + 5) % 24)::text where key = 'push_quiet_hours_end';

  -- Daily cap counts only non-critical sends…
  update public.platform_settings set value = '1' where key = 'push_marketing_max_per_day';
  delete from public.notification_push_log where user_id = a1;
  insert into public.notification_push_log (user_id, automation_key, category)
  values (a1, 'na_critical', 'critical');
  perform pg_temp.ok('gate.critical_sends_do_not_fill_the_cap',
    private.automation_push_blocked_reason(a1, 'na_marketing') is null,
    coalesce(private.automation_push_blocked_reason(a1, 'na_marketing'), 'null'));

  -- …and one marketing send fills it.
  insert into public.notification_push_log (user_id, automation_key, category)
  values (a1, 'na_marketing', 'marketing');
  perform pg_temp.ok('gate.daily_cap',
    private.automation_push_blocked_reason(a1, 'na_marketing') = 'daily_cap');
  perform pg_temp.ok('gate.daily_cap_does_not_block_critical',
    private.automation_push_blocked_reason(a1, 'na_critical') is null);

  -- Weekly cap, with the daily one out of the way.
  update public.platform_settings set value = '50' where key = 'push_marketing_max_per_day';
  update public.platform_settings set value = '1'  where key = 'push_marketing_max_per_week';
  perform pg_temp.ok('gate.weekly_cap',
    private.automation_push_blocked_reason(a1, 'na_marketing') = 'weekly_cap');
  update public.platform_settings set value = '99' where key = 'push_marketing_max_per_week';

  -- A log row older than the window must not count.
  delete from public.notification_push_log where user_id = a1;
  insert into public.notification_push_log (user_id, automation_key, category, sent_at)
  values (a1, 'na_marketing', 'marketing', now() - interval '8 days');
  update public.platform_settings set value = '1' where key = 'push_marketing_max_per_day';
  update public.platform_settings set value = '1' where key = 'push_marketing_max_per_week';
  perform pg_temp.ok('gate.old_sends_age_out_of_the_caps',
    private.automation_push_blocked_reason(a1, 'na_marketing') is null,
    coalesce(private.automation_push_blocked_reason(a1, 'na_marketing'), 'null'));
  update public.platform_settings set value = '50' where key = 'push_marketing_max_per_day';
  update public.platform_settings set value = '99' where key = 'push_marketing_max_per_week';
  delete from public.notification_push_log where user_id = a1;

  -- An unknown timezone must be treated as UTC, never crash.
  update public.profiles set timezone = null where id = a1;
  perform pg_temp.ok('gate.null_timezone_is_tolerated',
    private.automation_push_blocked_reason(a1, 'na_marketing') in ('quiet_hours') or
    private.automation_push_blocked_reason(a1, 'na_marketing') is null);
  update public.profiles set timezone = 'America/New_York' where id = a1;

  -- The master switch stops everything, including critical.
  update public.platform_settings set value = 'false' where key = 'push_automations_enabled';
  perform pg_temp.ok('gate.master_switch_stops_critical',
    private.automation_push_blocked_reason(a1, 'na_critical') = 'master_switch_off');
  update public.platform_settings set value = 'true' where key = 'push_automations_enabled';
end $$;

-- ── The renderer: private.render_automation ─────────────────────────────────

do $$
declare c record; n int;
begin
  select * into c from private.render_automation('na_critical',
    jsonb_build_object('thing', 'hold', 'id', 'abc'));
  perform pg_temp.ok('render.substitutes_title', c.title = 'Critical hold', c.title);
  perform pg_temp.ok('render.substitutes_body',  c.body  = 'Body hold',     c.body);
  perform pg_temp.ok('render.substitutes_link',  c.link  = '/tournament/abc', c.link);

  -- A variable the sender did not supply stays visible rather than becoming
  -- an empty gap — the same rule the email sender enforces with its 422.
  select * into c from private.render_automation('na_critical', '{}'::jsonb);
  perform pg_temp.ok('render.unsupplied_variable_is_left_intact',
    c.title = 'Critical {{thing}}', c.title);

  select count(*) into n from private.render_automation('na_does_not_exist', '{}'::jsonb);
  perform pg_temp.ok('render.missing_automation_returns_nothing', n = 0);
end $$;

-- ── The dispatch trigger and its log ────────────────────────────────────────

do $$
declare
  a1 uuid := '00000000-0000-4000-8000-0000000000a1';
  a3 uuid := '00000000-0000-4000-8000-0000000000a3';
  before_n int; after_n int; nid uuid;
begin
  delete from public.notification_push_log where user_id in (a1, a3);

  -- Allowed: one log row per dispatched push.
  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (a1, 'na_critical', 'T', 'B', '/x', 'na-test/allowed');
  select count(*) into after_n from public.notification_push_log
   where user_id = a1 and automation_key = 'na_critical';
  perform pg_temp.ok('dispatch.logs_an_allowed_push', after_n = 1, after_n::text);

  -- Blocked (no device): nothing logged, and the in-app row still exists.
  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (a3, 'na_critical', 'T', 'B', '/x', 'na-test/nodevice');
  select count(*) into after_n from public.notification_push_log where user_id = a3;
  perform pg_temp.ok('dispatch.blocked_push_is_not_logged', after_n = 0, after_n::text);
  perform pg_temp.ok('dispatch.blocked_push_still_writes_in_app',
    exists (select 1 from public.notifications where idempotency_key = 'na-test/nodevice'));

  -- A test send must never count against the caps.
  select count(*) into before_n from public.notification_push_log where user_id = a1;
  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (a1, 'na_critical', 'T', 'B', '/x', 'automation-test/na_critical/' || gen_random_uuid());
  select count(*) into after_n from public.notification_push_log where user_id = a1;
  perform pg_temp.ok('dispatch.test_sends_are_not_counted', after_n = before_n,
    format('%s -> %s', before_n, after_n));

  -- An unknown type is not an automation and must pass through silently.
  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (a1, 'na_not_an_automation', 'T', 'B', '/x', 'na-test/unknown-type');
  perform pg_temp.ok('dispatch.unknown_type_is_harmless',
    exists (select 1 from public.notifications where idempotency_key = 'na-test/unknown-type'));
end $$;

-- ── The resolver the edge function calls ────────────────────────────────────

do $$
declare
  a1 uuid := '00000000-0000-4000-8000-0000000000a1';
  nid uuid; n int;
begin
  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (a1, 'na_critical', 'Title', 'Body', '/x', 'na-test/resolve')
  returning id into nid;

  select count(*) into n from public.resolve_automation_push_recipients(nid, false);
  perform pg_temp.ok('resolve.returns_a_recipient', n = 1, n::text);

  -- Older than ten minutes: refused, so a stolen dispatch secret cannot replay
  -- yesterday's notifications.
  update public.notifications set created_at = now() - interval '11 minutes' where id = nid;
  select count(*) into n from public.resolve_automation_push_recipients(nid, false);
  perform pg_temp.ok('resolve.refuses_a_stale_notification', n = 0, n::text);
  update public.notifications set created_at = now() where id = nid;

  -- Blocked by the gate: refused, even though the row exists.
  update public.notification_automations set enabled = false where key = 'na_critical';
  select count(*) into n from public.resolve_automation_push_recipients(nid, false);
  perform pg_temp.ok('resolve.respects_the_gate', n = 0, n::text);

  -- …unless it is a test send, which is how an admin previews a disabled one.
  select count(*) into n from public.resolve_automation_push_recipients(nid, true);
  perform pg_temp.ok('resolve.test_flag_bypasses_the_gate', n = 1, n::text);
  update public.notification_automations set enabled = true where key = 'na_critical';
end $$;

-- ── Access control ──────────────────────────────────────────────────────────

do $$
declare
  a1 uuid := '00000000-0000-4000-8000-0000000000a1';
  a4 uuid := '00000000-0000-4000-8000-0000000000a4';
  v_player bigint; v_admin bigint; e_player text; n_admin int; e_nonadmin text;
begin
  perform pg_temp.as_user(a1);
  v_player := pg_temp.visible('select 1 from public.notification_automations');
  e_player := pg_temp.raises($q$update public.notification_automations set enabled = false where key = 'na_critical'$q$);
  perform pg_temp.as_postgres();

  perform pg_temp.ok('rls.player_sees_no_automations', v_player = 0, v_player::text);
  perform pg_temp.ok('rls.player_update_changes_nothing',
    (select enabled from public.notification_automations where key = 'na_critical') = true,
    coalesce(e_player, 'no error'));

  perform pg_temp.as_user(a4);
  v_admin := pg_temp.visible('select 1 from public.notification_automations');
  perform pg_temp.as_postgres();
  perform pg_temp.ok('rls.admin_sees_automations', v_admin > 0, v_admin::text);

  -- The admin list RPC is empty for a non-admin (it filters on is_admin()).
  perform pg_temp.as_user(a1);
  select count(*) into n_admin from public.admin_list_automations();
  perform pg_temp.as_postgres();
  perform pg_temp.ok('rls.admin_list_is_empty_for_a_player', n_admin = 0, n_admin::text);

  -- The test-send RPC refuses a non-admin outright.
  perform pg_temp.as_user(a1);
  e_nonadmin := pg_temp.raises($q$select public.admin_test_automation('na_critical')$q$);
  perform pg_temp.as_postgres();
  perform pg_temp.ok('rls.test_send_refuses_a_player',
    e_nonadmin is not null and e_nonadmin like '%not authorised%', coalesce(e_nonadmin, 'no error'));

  -- The push log is admin-only reading.
  perform pg_temp.as_user(a1);
  v_player := pg_temp.visible('select 1 from public.notification_push_log');
  perform pg_temp.as_postgres();
  perform pg_temp.ok('rls.player_sees_no_push_log', v_player = 0, v_player::text);
end $$;

-- ── Catalog integrity ───────────────────────────────────────────────────────

do $$
declare e_enable text; e_pref text;
begin
  -- An automation nothing senses cannot be switched on.
  e_enable := pg_temp.raises($q$update public.notification_automations set enabled = true where key = 'na_unwired'$q$);
  perform pg_temp.ok('catalog.unwired_cannot_be_enabled',
    e_enable is not null and e_enable like '%enabled_requires_wired%', coalesce(e_enable, 'no error'));

  -- A preference column that does not exist is refused, rather than failing
  -- open and notifying people who opted out.
  e_pref := pg_temp.raises($q$update public.notification_automations set pref_column = 'notif_nonexistent' where key = 'na_critical'$q$);
  perform pg_temp.ok('catalog.bad_pref_column_is_refused',
    e_pref is not null and e_pref like '%is not a boolean column%', coalesce(e_pref, 'no error'));

  -- Every wired automation must name a channel the dispatcher understands.
  perform pg_temp.ok('catalog.channels_are_valid',
    not exists (
      select 1 from public.notification_automations
       where not (channels <@ array['push','in_app','email'])
    ));

  -- Every live automation must be wired. Belt to the constraint's braces.
  perform pg_temp.ok('catalog.no_enabled_unwired_rows',
    not exists (select 1 from public.notification_automations where enabled and not wired));
end $$;

-- ── Summary ──────────────────────────────────────────────────────────────────

select test_name,
       case when passed then 'PASS' else 'FAIL' end as result,
       coalesce(detail, '') as detail
from na_results
order by passed, test_name;

select count(*) filter (where passed)     as passed,
       count(*) filter (where not passed) as failed,
       count(*)                           as total
from na_results;

do $$
declare n_failed int;
begin
  select count(*) into n_failed from na_results where not passed;
  if n_failed > 0 then
    raise exception 'Notification automation suite: % test(s) failed', n_failed;
  end if;
end $$;
