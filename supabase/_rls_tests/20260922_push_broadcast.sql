-- Push broadcast regression tests — Phase 7 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
--
-- Run against a LOCAL database only -- it seeds rows and rolls nothing back:
--
--   supabase db reset --local
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/_rls_tests/20260922_push_broadcast.sql
--
-- Same style as 20260824_rls_permission_matrix.sql: a temp results table, a
-- pg_temp.ok() recorder, impersonation through request.jwt.claims + the
-- Postgres role, a PASS/FAIL summary, and a non-zero exit on any failure.
-- Results are captured while impersonating and recorded after as_postgres():
-- pb_results belongs to postgres, so other roles cannot write it.
--
-- Covers what the Deno tests (process-campaign-batch/logic.test.ts: batching,
-- retry classification, pacing) and the shared vitest suite (deep-link
-- allowlist) cannot: access control, the audience rule, the send-once
-- guarantees, tap attribution and the destination check — all of which live
-- in SQL.
--
-- Assertions are about the FIXTURE rows (bb… users, pbtest tokens), never
-- totals, so the suite gives the same answers on a database that also holds
-- real tokens. It was first run that way, inside a rolled-back transaction
-- against production, on 2026-09-22.
--
-- Fixture actors:
--   ...01 player, iOS, tap-capable build
--   ...02 player, iOS, announcements OFF            -> never in an audience
--   ...03 player, platform unknown                  -> only in an "all" audience
--   ...04 deleted account (tombstone), iOS          -> never in an audience
--   ...05 player, Android
--   ...06 admin
--   ...07 second account on 01's phone, old build   -> shares 01's token
--   ...08 player with no token at all

\set ON_ERROR_STOP on

create temp table pb_results (
  test_name text primary key,
  passed    boolean not null,
  detail    text
) on commit preserve rows;

create or replace function pg_temp.ok(p_name text, p_passed boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into pb_results(test_name, passed, detail)
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

create or replace function pg_temp.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
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

-- ── Fixtures ─────────────────────────────────────────────────────────────────

do $$
begin
  insert into auth.users(id, aud, role, email, email_confirmed_at,
                         raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select ('bb000000-0000-0000-0000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
         'pb-test-' || n || '@example.test', now(), '{}', '{}', now(), now()
    from generate_series(1, 8) n
  on conflict (id) do nothing;

  insert into public.profiles(id, email, full_name, role)
  select ('bb000000-0000-0000-0000-00000000000' || n)::uuid, 'pb-test-' || n || '@example.test',
         'PB Test ' || n, (case when n = 6 then 'admin' else 'player' end)::public.user_role
    from generate_series(1, 8) n
  on conflict (id) do update set role = excluded.role;

  update public.profiles
     set notif_announcements = (id <> 'bb000000-0000-0000-0000-000000000002'),
         deleted_at = case when id = 'bb000000-0000-0000-0000-000000000004' then now() end
   where id::text like 'bb000000-0000-0000-0000-00000000000_';

  delete from public.push_tokens where expo_push_token like 'ExponentPushToken[pbtest-%';
  insert into public.push_tokens(user_id, expo_push_token, platform, app_version, tap_events_supported) values
    ('bb000000-0000-0000-0000-000000000001', 'ExponentPushToken[pbtest-phone1]',  'ios',     '1.0.0', true),
    ('bb000000-0000-0000-0000-000000000007', 'ExponentPushToken[pbtest-phone1]',  'ios',     null,    false),
    ('bb000000-0000-0000-0000-000000000002', 'ExponentPushToken[pbtest-optout]',  'ios',     '1.0.0', true),
    ('bb000000-0000-0000-0000-000000000003', 'ExponentPushToken[pbtest-unknown]', 'unknown', null,    false),
    ('bb000000-0000-0000-0000-000000000004', 'ExponentPushToken[pbtest-deleted]', 'ios',     '1.0.0', true),
    ('bb000000-0000-0000-0000-000000000005', 'ExponentPushToken[pbtest-android]', 'android', '1.0.0', true),
    ('bb000000-0000-0000-0000-000000000006', 'ExponentPushToken[pbtest-admin]',   'ios',     '1.0.0', true);
end $$;

-- ── 1. Access: who can read what ─────────────────────────────────────────────

do $$
declare
  c uuid;
  a_camp bigint; a_del bigint; a_aud bigint; a_tap bigint;
  p_camp bigint; p_del bigint; p_aud bigint; p_sum text; p_dels text;
  ad_camp bigint; ad_del bigint; ad_masked boolean;
  imm text;
begin
  -- One campaign so there is something to (not) see.
  insert into public.notification_campaigns (internal_name, title, body, audience_type,
                                             destination_url, destination_type, status)
  values ('PBTEST access', 't', 'b', 'all',
          'pickleballapp://tournament/00000000-0000-0000-0000-000000000000', 'tournament', 'draft')
  returning id into c;
  insert into public.campaign_deliveries (campaign_id, user_id, expo_push_token)
  values (c, 'bb000000-0000-0000-0000-000000000001', 'ExponentPushToken[pbtest-access]');

  perform pg_temp.as_anon();
  a_camp := pg_temp.visible('select 1 from public.notification_campaigns');
  a_del  := pg_temp.visible('select 1 from public.campaign_deliveries');
  a_aud  := pg_temp.visible('select 1 from public.campaign_audit_log');
  a_tap  := pg_temp.visible('select 1 from public.campaign_taps');
  perform pg_temp.as_postgres();
  perform pg_temp.ok('access.anon.campaigns',  a_camp <= 0, format('n=%s', a_camp));
  perform pg_temp.ok('access.anon.deliveries', a_del = -1,  format('n=%s', a_del));
  perform pg_temp.ok('access.anon.audit',      a_aud <= 0,  format('n=%s', a_aud));
  perform pg_temp.ok('access.anon.taps',       a_tap <= 0,  format('n=%s', a_tap));

  perform pg_temp.as_user('bb000000-0000-0000-0000-000000000001');
  p_camp := pg_temp.visible('select 1 from public.notification_campaigns');
  p_del  := pg_temp.visible('select 1 from public.campaign_deliveries');
  p_aud  := pg_temp.visible('select 1 from public.campaign_audit_log');
  p_sum  := pg_temp.raises(format('select * from public.admin_campaign_summary(%L)', c));
  p_dels := pg_temp.raises(format('select * from public.admin_campaign_deliveries(%L)', c));
  perform pg_temp.as_postgres();
  perform pg_temp.ok('access.player.campaigns',  p_camp = 0,  format('n=%s', p_camp));
  perform pg_temp.ok('access.player.deliveries', p_del = -1,  format('n=%s', p_del));
  perform pg_temp.ok('access.player.audit',      p_aud = 0,   format('n=%s', p_aud));
  perform pg_temp.ok('access.player.admin_summary_refused',    p_sum like '%not authorized%', p_sum);
  perform pg_temp.ok('access.player.admin_deliveries_refused', p_dels like '%not authorized%', p_dels);

  perform pg_temp.as_user('bb000000-0000-0000-0000-000000000006');
  ad_camp := pg_temp.visible(format('select 1 from public.notification_campaigns where id = %L', c));
  ad_del  := pg_temp.visible('select 1 from public.campaign_deliveries');
  select bool_and(token_masked not like '%ExponentPushToken%' and token_masked like '…%')
    into ad_masked from public.admin_campaign_deliveries(c);
  perform pg_temp.as_postgres();
  perform pg_temp.ok('access.admin.campaigns', ad_camp = 1, format('n=%s', ad_camp));
  perform pg_temp.ok('access.admin.deliveries_table_still_denied', ad_del = -1, format('n=%s', ad_del));
  perform pg_temp.ok('access.admin.deliveries_masked', ad_masked);

  imm := pg_temp.raises('update public.campaign_audit_log set action = action');
  perform pg_temp.ok('access.audit_append_only',
    imm like '%append-only%' or not exists (select 1 from public.campaign_audit_log), imm);
end $$;

-- ── 2. Function lockdown ─────────────────────────────────────────────────────

do $$
declare
  f text;
  bad text := '';
  e_upsert text; e_preview text; e_dest text; e_abort text; e_tap text;
begin
  -- Service-role only: none of these may be reachable from a browser session.
  foreach f in array array[
    'public.claim_campaign_send(uuid,text,uuid)', 'public.snapshot_campaign_recipients(uuid)',
    'public.claim_due_campaigns()', 'public.worker_active_campaigns()',
    'public.worker_claim_batch(uuid,integer)', 'public.worker_record_results(uuid,jsonb)',
    'public.worker_fail_campaign(uuid,text)', 'public.worker_finalize_campaign(uuid)',
    'public.reconcile_campaign_receipts()', 'public.freeze_campaign_stats()',
    'public.prune_campaign_deliveries()', 'public.fn_send_transactional_email(jsonb)',
    'public.is_valid_push_dispatch(text)'
  ] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      bad := bad || f || ' ';
    end if;
  end loop;
  perform pg_temp.ok('lockdown.service_only_functions', bad = '', nullif(bad, ''));

  -- Admin RPCs are executable by authenticated, and refuse non-admins inside.
  perform pg_temp.as_user('bb000000-0000-0000-0000-000000000001');
  e_upsert  := pg_temp.raises($q$select public.admin_upsert_campaign('x','t','b','all','pickleballapp://tournament/abc')$q$);
  e_preview := pg_temp.raises($q$select * from public.admin_preview_campaign_audience('all')$q$);
  e_dest    := pg_temp.raises($q$select public.admin_campaign_destination_preview('pickleballapp://tournament/abc')$q$);
  e_abort   := pg_temp.raises($q$select public.admin_abort_campaign(gen_random_uuid())$q$);
  perform pg_temp.as_postgres();
  perform pg_temp.ok('lockdown.upsert_refuses_player',              e_upsert  like '%not authorized%', e_upsert);
  perform pg_temp.ok('lockdown.preview_refuses_player',             e_preview like '%not authorized%', e_preview);
  perform pg_temp.ok('lockdown.destination_preview_refuses_player', e_dest    like '%not authorized%', e_dest);
  perform pg_temp.ok('lockdown.abort_refuses_player',               e_abort   like '%not authorized%', e_abort);

  perform pg_temp.as_anon();
  e_tap := pg_temp.raises($q$select public.record_campaign_tap(gen_random_uuid())$q$);
  perform pg_temp.as_postgres();
  perform pg_temp.ok('lockdown.tap_refuses_anon', e_tap is not null, e_tap);
end $$;

-- ── 3. Audience: who a campaign reaches ──────────────────────────────────────

do $$
declare
  c_all uuid;
  c_ios uuid;
  n1 int;
  n2 int;
begin
  insert into public.notification_campaigns (internal_name, title, body, audience_type, audience_platform,
                                             destination_url, destination_type, status)
  values ('PBTEST all', 't', 'b', 'all', null,
          'pickleballapp://tournament/00000000-0000-0000-0000-000000000000', 'tournament', 'queuing')
  returning id into c_all;
  insert into public.notification_campaigns (internal_name, title, body, audience_type, audience_platform,
                                             destination_url, destination_type, status)
  values ('PBTEST ios', 't', 'b', 'platform', 'ios',
          'pickleballapp://tournament/00000000-0000-0000-0000-000000000000', 'tournament', 'queuing')
  returning id into c_ios;

  execute 'set local role service_role';
  n1 := public.snapshot_campaign_recipients(c_all);
  n2 := public.snapshot_campaign_recipients(c_all);
  perform public.snapshot_campaign_recipients(c_ios);
  execute 'reset role';

  perform pg_temp.ok('audience.snapshot_idempotent', n1 = n2, format('%s then %s', n1, n2));
  perform pg_temp.ok('audience.all.includes_player',
    exists (select 1 from public.campaign_deliveries where campaign_id = c_all and expo_push_token = 'ExponentPushToken[pbtest-phone1]'));
  perform pg_temp.ok('audience.all.includes_unknown_platform',
    exists (select 1 from public.campaign_deliveries where campaign_id = c_all and expo_push_token = 'ExponentPushToken[pbtest-unknown]'));
  perform pg_temp.ok('audience.all.includes_android',
    exists (select 1 from public.campaign_deliveries where campaign_id = c_all and expo_push_token = 'ExponentPushToken[pbtest-android]'));
  perform pg_temp.ok('audience.excludes_opted_out',
    not exists (select 1 from public.campaign_deliveries where campaign_id = c_all and expo_push_token = 'ExponentPushToken[pbtest-optout]'));
  perform pg_temp.ok('audience.excludes_deleted_account',
    not exists (select 1 from public.campaign_deliveries where campaign_id = c_all and expo_push_token = 'ExponentPushToken[pbtest-deleted]'));
  perform pg_temp.ok('audience.excludes_tokenless_user',
    not exists (select 1 from public.campaign_deliveries where campaign_id = c_all and user_id = 'bb000000-0000-0000-0000-000000000008'));
  perform pg_temp.ok('audience.shared_phone_one_delivery',
    (select count(*) from public.campaign_deliveries where campaign_id = c_all and expo_push_token = 'ExponentPushToken[pbtest-phone1]') = 1);
  perform pg_temp.ok('audience.shared_phone_marked_capable',
    (select tap_capable from public.campaign_deliveries where campaign_id = c_all and expo_push_token = 'ExponentPushToken[pbtest-phone1]'));
  perform pg_temp.ok('audience.ios.excludes_unknown_platform',
    not exists (select 1 from public.campaign_deliveries where campaign_id = c_ios and expo_push_token = 'ExponentPushToken[pbtest-unknown]'));
  perform pg_temp.ok('audience.ios.excludes_android',
    not exists (select 1 from public.campaign_deliveries where campaign_id = c_ios and expo_push_token = 'ExponentPushToken[pbtest-android]'));
  perform pg_temp.ok('audience.ios.counts_excluded_unknown',
    (select excluded_unknown_platform_count from public.notification_campaigns where id = c_ios) >= 1);
end $$;

-- ── 4. Send-once guarantees and the kill switch ──────────────────────────────

do $$
declare
  was text := (select value from public.platform_settings where key = 'push_broadcast_enabled');
  c uuid;
  r1 jsonb;
  r2 jsonb;
  r3 jsonb;
  b1 jsonb;
  b2 jsonb;
  ids1 text[];
  ids2 text[];
  e_actor text;
  e_dup text;
begin
  insert into public.notification_campaigns (internal_name, title, body, audience_type,
                                             destination_url, destination_type, status,
                                             scheduled_at, idempotency_key)
  values ('PBTEST claim', 't', 'b', 'all',
          'pickleballapp://tournament/00000000-0000-0000-0000-000000000000', 'tournament', 'scheduled',
          now(), 'pbtest-key')
  returning id into c;

  -- Off: nothing is claimed.
  update public.platform_settings set value = 'false' where key = 'push_broadcast_enabled';
  execute 'set local role service_role';
  r1 := public.claim_campaign_send(c, 'pbtest-key', 'bb000000-0000-0000-0000-000000000006');
  b1 := public.worker_claim_batch(c, 10);
  execute 'reset role';
  perform pg_temp.ok('switch.off_refuses_claim', r1->>'result' = 'disabled', r1::text);
  perform pg_temp.ok('switch.off_worker_claims_nothing', b1->>'state' = 'disabled', b1::text);

  -- On: a wrong key is refused, the right one claims exactly once.
  update public.platform_settings set value = 'true' where key = 'push_broadcast_enabled';
  execute 'set local role service_role';
  r1 := public.claim_campaign_send(c, 'wrong-key', 'bb000000-0000-0000-0000-000000000006');
  r2 := public.claim_campaign_send(c, 'pbtest-key', 'bb000000-0000-0000-0000-000000000006');
  r3 := public.claim_campaign_send(c, 'pbtest-key', 'bb000000-0000-0000-0000-000000000006');
  e_actor := pg_temp.raises(format($q$select public.claim_campaign_send(%L, 'pbtest-key', 'bb000000-0000-0000-0000-000000000001')$q$, c));
  b1 := public.worker_claim_batch(c, 2);
  b2 := public.worker_claim_batch(c, 2);
  execute 'reset role';

  perform pg_temp.ok('claim.wrong_key', r1->>'result' = 'key_mismatch', r1::text);
  perform pg_temp.ok('claim.first_claims', r2->>'result' = 'claimed', r2::text);
  perform pg_temp.ok('claim.second_is_already_claimed', r3->>'result' = 'already_claimed', r3::text);
  perform pg_temp.ok('claim.requires_admin_actor', e_actor like '%not authorized%', e_actor);

  -- Two batches never share a row.
  select array_agg(x->>'id') into ids1 from jsonb_array_elements(b1->'deliveries') x;
  select array_agg(x->>'id') into ids2 from jsonb_array_elements(b2->'deliveries') x;
  perform pg_temp.ok('worker.batches_disjoint',
    coalesce(array_length(ids1, 1), 0) > 0 and not (coalesce(ids1, '{}') && coalesce(ids2, '{}')),
    format('%s / %s', ids1, ids2));
  perform pg_temp.ok('worker.claimed_rows_submitted',
    (select bool_and(status = 'submitted') from public.campaign_deliveries where id::text = any(ids1)));

  -- Duplicate protection is the database's: a second row for one device fails.
  e_dup := pg_temp.raises(format($q$insert into public.campaign_deliveries (campaign_id, user_id, expo_push_token)
                                    select campaign_id, user_id, expo_push_token from public.campaign_deliveries
                                     where campaign_id = %L limit 1$q$, c));
  perform pg_temp.ok('claim.one_delivery_per_device', e_dup like '%duplicate key%', e_dup);

  update public.platform_settings set value = was where key = 'push_broadcast_enabled';
end $$;

-- ── 5. Taps: identity and attribution ────────────────────────────────────────

do $$
declare
  c uuid;
  r_owner boolean;
  r_owner_again boolean;
  r_shared boolean;
  r_incapable boolean;
  r_notsent boolean;
begin
  insert into public.notification_campaigns (internal_name, title, body, audience_type,
                                             destination_url, destination_type, status)
  values ('PBTEST taps', 't', 'b', 'all',
          'pickleballapp://tournament/00000000-0000-0000-0000-000000000000', 'tournament', 'sent')
  returning id into c;
  insert into public.campaign_deliveries (campaign_id, user_id, expo_push_token, status, tap_capable) values
    (c, 'bb000000-0000-0000-0000-000000000001', 'ExponentPushToken[pbtest-phone1]',  'accepted', true),
    (c, 'bb000000-0000-0000-0000-000000000005', 'ExponentPushToken[pbtest-android]', 'accepted', false);

  perform pg_temp.as_user('bb000000-0000-0000-0000-000000000001');
  r_owner := public.record_campaign_tap(c);
  r_owner_again := public.record_campaign_tap(c);
  perform pg_temp.as_postgres();
  perform pg_temp.as_user('bb000000-0000-0000-0000-000000000007');
  r_shared := public.record_campaign_tap(c);
  perform pg_temp.as_postgres();
  perform pg_temp.as_user('bb000000-0000-0000-0000-000000000005');
  r_incapable := public.record_campaign_tap(c);  -- delivered, but to a build that cannot report taps
  perform pg_temp.as_postgres();
  perform pg_temp.as_user('bb000000-0000-0000-0000-000000000008');
  r_notsent := public.record_campaign_tap(c);
  perform pg_temp.as_postgres();

  perform pg_temp.ok('tap.recipient_recorded', r_owner and r_owner_again);
  perform pg_temp.ok('tap.deduplicated',
    (select count(*) from public.campaign_taps where campaign_id = c and user_id = 'bb000000-0000-0000-0000-000000000001') = 1);
  perform pg_temp.ok('tap.shared_phone_account_recorded', r_shared);
  perform pg_temp.ok('tap.incapable_build_not_counted', not r_incapable);
  perform pg_temp.ok('tap.not_sent_not_counted', not r_notsent);
  perform pg_temp.ok('tap.rows_match_attribution',
    (select count(*) from public.campaign_taps where campaign_id = c) = 2);
end $$;

-- ── 6. Destination check ─────────────────────────────────────────────────────

do $$
declare
  c uuid;
  found_missing boolean;
  e_schedule text;
  e_foreign text;
begin
  perform pg_temp.as_user('bb000000-0000-0000-0000-000000000006');
  c := public.admin_upsert_campaign('PBTEST dest', 't', 'b', 'all',
                                    'pickleballapp://tournament/00000000-0000-0000-0000-000000000000');
  found_missing := (public.admin_campaign_destination_preview(
                      'pickleballapp://tournament/00000000-0000-0000-0000-000000000000')->>'found')::boolean;
  e_schedule := pg_temp.raises(format('select public.admin_schedule_campaign(%L, now() + interval ''1 hour'')', c));
  e_foreign  := pg_temp.raises($q$select public.admin_upsert_campaign('x','t','b','all','https://evil.example/tournament/abc')$q$);
  perform pg_temp.as_postgres();

  perform pg_temp.ok('destination.missing_item_not_found', found_missing = false);
  perform pg_temp.ok('destination.schedule_refuses_missing_item', e_schedule like '%destination_not_found%', e_schedule);
  perform pg_temp.ok('destination.upsert_rejects_foreign_host', e_foreign like '%invalid_destination%', e_foreign);
  perform pg_temp.ok('destination.refused_campaign_stays_draft',
    (select status from public.notification_campaigns where id = c) = 'draft');
end $$;

-- ── Summary ──────────────────────────────────────────────────────────────────

select test_name,
       case when passed then 'PASS' else 'FAIL' end as result,
       coalesce(detail, '') as detail
from pb_results
order by passed, test_name;

select count(*) filter (where passed)     as passed,
       count(*) filter (where not passed) as failed,
       count(*)                           as total
from pb_results;

do $$
declare n_failed int;
begin
  select count(*) into n_failed from pb_results where not passed;
  if n_failed > 0 then
    raise exception 'Push broadcast suite: % test(s) failed', n_failed;
  end if;
end $$;
