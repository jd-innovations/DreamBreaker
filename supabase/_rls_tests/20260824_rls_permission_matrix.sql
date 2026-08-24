-- RLS / permission matrix regression tests (TODO1.1 item 2.2).
--
-- Run against a LOCAL database only -- it seeds rows and rolls nothing back:
--
--   supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/_rls_tests/20260824_rls_permission_matrix.sql
--
-- Style follows supabase/_par_validation/*.sql: a temp results table, a
-- pg_temp.ok() recorder, and a PASS/FAIL summary at the end. Exit is non-zero
-- on any failure so this can gate CI.
--
-- Impersonation works because auth.uid() reads request.jwt.claims (verified
-- against the deployed auth.uid() definition), so setting that GUC plus the
-- Postgres role reproduces exactly what PostgREST does for a real request.
--
-- Every test asserts BOTH directions. A policy that returns the owner's row is
-- only half the claim -- the half that matters is that nobody else's row comes
-- back. Positive-only tests pass just as happily against `USING (true)`.

\set ON_ERROR_STOP on

create temp table rls_results (
  test_name text primary key,
  passed    boolean not null,
  detail    text
) on commit preserve rows;

create or replace function pg_temp.ok(p_name text, p_passed boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into rls_results(test_name, passed, detail)
  values (p_name, p_passed, p_detail)
  on conflict (test_name) do update set passed = excluded.passed, detail = excluded.detail;
end;
$$;

-- ── Impersonation helpers ────────────────────────────────────────────────────
-- `set local` scopes to the surrounding transaction; each DO block below resets
-- the role before recording its result so pg_temp stays writable.

create or replace function pg_temp.as_user(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid, 'role', 'authenticated')::text,
                     true);
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

-- Records whether a write was rejected. RLS denies a write in two different
-- shapes and both count:
--
--   * A WITH CHECK violation, or a missing grant, raises 42501
--     (insufficient_privilege).
--   * A USING clause that excludes the row raises NOTHING -- the statement
--     succeeds and affects zero rows. Treating that as "not denied" would
--     invert the result of every UPDATE test here.
--
-- Anything else is re-raised on purpose. If this swallowed arbitrary errors, a
-- typo in the test SQL would report as a successful denial and the test would
-- pass while checking nothing.
create or replace function pg_temp.denied(p_sql text)
returns boolean language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n = 0;
exception when insufficient_privilege then
  return true;
end;
$$;

-- Counts rows visible to the current actor, where "no grant at all" and "grant
-- but RLS filters everything" are both legitimate ways to see nothing. Returns
-- -1 for the former so the two stay distinguishable in the detail column.
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

-- ── Actors ───────────────────────────────────────────────────────────────────
--   ...01 owner      the subject of most "own row" policies
--   ...02 other      unrelated authenticated user -- the negative case
--   ...03 director   approved director, owns the tournament
--   ...04 coach      seller side of a coach purchase
--   ...05 staff      facility member (staff rank) at the test facility
--   ...06 admin      role = 'admin', satisfies is_admin()

do $$
begin
  insert into auth.users(id, aud, role, email, email_confirmed_at,
                         raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('aa000000-0000-0000-0000-000000000001','authenticated','authenticated','rls-owner@example.test',   now(),'{}','{}',now(),now()),
    ('aa000000-0000-0000-0000-000000000002','authenticated','authenticated','rls-other@example.test',   now(),'{}','{}',now(),now()),
    ('aa000000-0000-0000-0000-000000000003','authenticated','authenticated','rls-director@example.test',now(),'{}','{}',now(),now()),
    ('aa000000-0000-0000-0000-000000000004','authenticated','authenticated','rls-coach@example.test',   now(),'{}','{}',now(),now()),
    ('aa000000-0000-0000-0000-000000000005','authenticated','authenticated','rls-staff@example.test',   now(),'{}','{}',now(),now()),
    ('aa000000-0000-0000-0000-000000000006','authenticated','authenticated','rls-admin@example.test',   now(),'{}','{}',now(),now())
  on conflict (id) do nothing;

  insert into public.profiles(id, email, full_name, role, skill_level, self_rating, is_director, director_status)
  values
    ('aa000000-0000-0000-0000-000000000001','rls-owner@example.test',   'RLS Owner',   'player',  '3.5-4.0','3.5',false,null),
    ('aa000000-0000-0000-0000-000000000002','rls-other@example.test',   'RLS Other',   'player',  '3.5-4.0','3.5',false,null),
    ('aa000000-0000-0000-0000-000000000003','rls-director@example.test','RLS Director','director','4.0-4.5','4.0',true,'approved'),
    ('aa000000-0000-0000-0000-000000000004','rls-coach@example.test',   'RLS Coach',   'player',  '4.0-4.5','4.5',false,null),
    ('aa000000-0000-0000-0000-000000000005','rls-staff@example.test',   'RLS Staff',   'player',  '3.0-3.5','3.0',false,null),
    ('aa000000-0000-0000-0000-000000000006','rls-admin@example.test',   'RLS Admin',   'admin',   '3.5-4.0','3.5',false,null)
  -- DO UPDATE, not DO NOTHING. The auth.users insert above fires a trigger that
  -- creates the profile with role='player', so DO NOTHING silently discarded
  -- every role here and left the admin and director actors as ordinary players
  -- -- making their tests assert nothing while still reporting PASS.
  on conflict (id) do update set
    full_name       = excluded.full_name,
    role            = excluded.role,
    is_director     = excluded.is_director,
    director_status = excluded.director_status;

  insert into public.facilities(id, name, slug, address, city, state, postal_code,
                                latitude, longitude, verified, court_count, created_by)
  values ('ab000000-0000-0000-0000-000000000001','RLS Test Facility','rls-test-facility',
          '1 Test Way','Austin','TX','78701',30.2672,-97.7431,true,4,
          'aa000000-0000-0000-0000-000000000003')
  on conflict (id) do nothing;

  insert into public.courts(id, facility_id, name, indoor_outdoor)
  values ('ac000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000001','RLS Court 1','indoor')
  on conflict (id) do nothing;

  insert into public.facility_members(facility_id, user_id, role)
  values ('ab000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000005','staff')
  on conflict do nothing;
end $$;

-- Domain rows. Each is owned by ...01 (owner) so ...02 (other) is always the
-- negative case.
do $$
begin
  -- Reservation owned by owner, confirmed.
  insert into public.reservations(id, facility_id, asset_type, asset_id, organizer_id,
                                  max_players, time_range, base_price_cents, final_price_cents, status)
  values ('ad000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000001','court',
          'ac000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001',
          4, tstzrange(now() + interval '1 day', now() + interval '1 day 1 hour'), 3000, 3000, 'confirmed')
  on conflict (id) do nothing;

  -- Payment for it, payer = owner.
  insert into public.payments(id, purpose_type, purpose_id, payer_user_id, amount_cents, status)
  values ('ae000000-0000-0000-0000-000000000001','reservation_payment',
          'ad000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001',3000,'succeeded')
  on conflict (id) do nothing;

  -- PK is (user_id, expo_push_token); there is no id column.
  insert into public.push_tokens(user_id, expo_push_token)
  values ('aa000000-0000-0000-0000-000000000001','ExponentPushToken[rls-owner]')
  on conflict (user_id, expo_push_token) do nothing;

  insert into public.wallet_items(id, user_id, type, title)
  values ('b0000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','coach_voucher','RLS Voucher')
  on conflict (id) do nothing;

  -- Two listings: one active (publicly readable), one sold (owner only).
  -- 'sold' rather than 'draft' -- marketplace_listing_status is
  -- (active, pending, sold, deleted); there is no draft state.
  insert into public.marketplace_listings(id, seller_id, brand, model, title, condition,
                                          asking_price_cents, min_offer_cents, status)
  values
    ('b1000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','RLSBrand','M1','Active listing','good',5000,4000,'active'),
    ('b1000000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001','RLSBrand','M2','Sold listing','good',5000,4000,'sold')
  on conflict (id) do nothing;

  -- Mutual like between owner and other -- the v_mutual_matches regression.
  insert into public.matchmaking_swipes(requester_id, target_id, direction)
  values
    ('aa000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000002','like'),
    ('aa000000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001','like')
  on conflict do nothing;
end $$;

-- ── profiles ─────────────────────────────────────────────────────────────────

do $$
declare n_anon int; n_other int;
begin
  perform pg_temp.as_anon();
  select count(*) into n_anon from public.profiles where id = 'aa000000-0000-0000-0000-000000000001';
  perform pg_temp.as_postgres();
  -- `profiles: public read` is USING (true). This test pins that as DELIBERATE:
  -- if it ever needs to become private, this is the test that should fail and
  -- force the decision to be made explicitly.
  perform pg_temp.ok('profiles.anon_can_read_profiles_by_design', n_anon = 1,
                     format('anon saw %s rows; policy is USING (true)', n_anon));

  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000002');
  select count(*) into n_other from public.profiles where id = 'aa000000-0000-0000-0000-000000000001';
  perform pg_temp.as_postgres();
  perform pg_temp.ok('profiles.other_can_read_profile_by_design', n_other = 1, format('n=%s', n_other));
end $$;

-- The privilege-escalation case: `profiles: own update` has a WITH CHECK that
-- pins role/is_director/director_status to their current values, so a user
-- cannot promote themselves by updating their own row.
do $$
declare escalated_role boolean; escalated_director boolean; renamed boolean;
begin
  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000001');
  escalated_role := pg_temp.denied(
    $q$update public.profiles set role = 'admin' where id = 'aa000000-0000-0000-0000-000000000001'$q$);
  escalated_director := pg_temp.denied(
    $q$update public.profiles set is_director = true, director_status = 'approved'
        where id = 'aa000000-0000-0000-0000-000000000001'$q$);
  renamed := pg_temp.denied(
    $q$update public.profiles set full_name = 'RLS Owner Renamed'
        where id = 'aa000000-0000-0000-0000-000000000001'$q$);
  perform pg_temp.as_postgres();

  perform pg_temp.ok('profiles.cannot_self_promote_to_admin', escalated_role, 'update role=admin must be rejected');
  perform pg_temp.ok('profiles.cannot_self_grant_director',    escalated_director, 'update is_director/director_status must be rejected');
  -- Guards against "fix" the escalation by blocking all self-updates.
  perform pg_temp.ok('profiles.can_still_edit_own_safe_fields', not renamed, 'full_name update must still succeed');
end $$;

do $$
declare denied_other boolean;
begin
  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000002');
  denied_other := pg_temp.denied(
    $q$update public.profiles set full_name = 'Hijacked' where id = 'aa000000-0000-0000-0000-000000000001'$q$);
  perform pg_temp.as_postgres();
  perform pg_temp.ok('profiles.other_cannot_update_my_profile', denied_other, null);
end $$;

-- ── payments ─────────────────────────────────────────────────────────────────
-- Server-authoritative: readable by the payer and admin, writable by nobody
-- except the service role (which bypasses RLS entirely).

do $$
declare n_owner int; n_other int; n_anon int; n_admin int; wrote boolean;
begin
  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000001');
  select count(*) into n_owner from public.payments where id = 'ae000000-0000-0000-0000-000000000001';
  perform pg_temp.as_postgres();

  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000002');
  select count(*) into n_other from public.payments where id = 'ae000000-0000-0000-0000-000000000001';
  perform pg_temp.as_postgres();

  perform pg_temp.as_anon();
  select count(*) into n_anon from public.payments;
  perform pg_temp.as_postgres();

  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000006');
  select count(*) into n_admin from public.payments where id = 'ae000000-0000-0000-0000-000000000001';
  perform pg_temp.as_postgres();

  perform pg_temp.ok('payments.payer_reads_own',      n_owner = 1, format('n=%s', n_owner));
  perform pg_temp.ok('payments.other_cannot_read',    n_other = 0, format('n=%s', n_other));
  perform pg_temp.ok('payments.anon_cannot_read_any', n_anon  = 0, format('n=%s', n_anon));
  perform pg_temp.ok('payments.admin_reads_any',      n_admin = 1, format('n=%s', n_admin));

  -- The money-safety invariant: a client must never be able to mark itself paid.
  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000001');
  wrote := pg_temp.denied(
    $q$update public.payments set status = 'succeeded' where id = 'ae000000-0000-0000-0000-000000000001'$q$);
  perform pg_temp.as_postgres();
  perform pg_temp.ok('payments.payer_cannot_write_status', wrote, 'no UPDATE policy exists for authenticated');

  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000001');
  wrote := pg_temp.denied(
    $q$insert into public.payments(purpose_type, purpose_id, payer_user_id, amount_cents, status)
       values ('reservation_payment','ad000000-0000-0000-0000-000000000001',
               'aa000000-0000-0000-0000-000000000001', 1, 'succeeded')$q$);
  perform pg_temp.as_postgres();
  perform pg_temp.ok('payments.client_cannot_insert', wrote, 'no INSERT policy exists for authenticated');
end $$;

-- ── wallet_items ─────────────────────────────────────────────────────────────
-- SELECT-own is the only policy; there are no write policies at all.

do $$
declare n_owner int; n_other int; wrote boolean;
begin
  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000001');
  select count(*) into n_owner from public.wallet_items where id = 'b0000000-0000-0000-0000-000000000001';
  perform pg_temp.as_postgres();

  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000002');
  select count(*) into n_other from public.wallet_items where id = 'b0000000-0000-0000-0000-000000000001';
  wrote := pg_temp.denied(
    $q$update public.wallet_items set title = 'Stolen' where id = 'b0000000-0000-0000-0000-000000000001'$q$);
  perform pg_temp.as_postgres();

  perform pg_temp.ok('wallet.owner_reads_own',       n_owner = 1, format('n=%s', n_owner));
  perform pg_temp.ok('wallet.other_cannot_read',     n_other = 0, format('n=%s', n_other));
  perform pg_temp.ok('wallet.other_cannot_redeem',   wrote,       'no UPDATE policy exists');
end $$;

-- ── push_tokens ──────────────────────────────────────────────────────────────
-- A leaked push token lets someone send notifications as the app, so the
-- negative case here matters more than the positive one.

do $$
declare n_owner int; n_other int; stole boolean;
begin
  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000001');
  select count(*) into n_owner from public.push_tokens where user_id = 'aa000000-0000-0000-0000-000000000001';
  perform pg_temp.as_postgres();

  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000002');
  select count(*) into n_other from public.push_tokens where user_id = 'aa000000-0000-0000-0000-000000000001';
  -- WITH CHECK (user_id = auth.uid()) must stop a token being planted on someone else.
  stole := pg_temp.denied(
    $q$insert into public.push_tokens(user_id, expo_push_token)
       values ('aa000000-0000-0000-0000-000000000001','ExponentPushToken[planted]')$q$);
  perform pg_temp.as_postgres();

  perform pg_temp.ok('push_tokens.owner_reads_own',            n_owner = 1, format('n=%s', n_owner));
  perform pg_temp.ok('push_tokens.other_cannot_read',          n_other = 0, format('n=%s', n_other));
  perform pg_temp.ok('push_tokens.cannot_insert_for_other',    stole,       null);
end $$;

-- ── marketplace_listings ─────────────────────────────────────────────────────
-- Active listings are public; anything else is owner-only.

do $$
declare n_active_anon int; n_sold_anon int; n_sold_owner int; n_sold_other int; hijack boolean;
begin
  perform pg_temp.as_anon();
  select count(*) into n_active_anon from public.marketplace_listings where id = 'b1000000-0000-0000-0000-000000000001';
  select count(*) into n_sold_anon  from public.marketplace_listings where id = 'b1000000-0000-0000-0000-000000000002';
  perform pg_temp.as_postgres();

  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000001');
  select count(*) into n_sold_owner from public.marketplace_listings where id = 'b1000000-0000-0000-0000-000000000002';
  perform pg_temp.as_postgres();

  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000002');
  select count(*) into n_sold_other from public.marketplace_listings where id = 'b1000000-0000-0000-0000-000000000002';
  hijack := pg_temp.denied(
    $q$update public.marketplace_listings set asking_price_cents = 1
        where id = 'b1000000-0000-0000-0000-000000000001'$q$);
  perform pg_temp.as_postgres();

  perform pg_temp.ok('marketplace.anon_reads_active',        n_active_anon = 1, format('n=%s', n_active_anon));
  perform pg_temp.ok('marketplace.anon_cannot_read_sold',   n_sold_anon  = 0, format('n=%s', n_sold_anon));
  perform pg_temp.ok('marketplace.owner_reads_own_sold',    n_sold_owner = 1, format('n=%s', n_sold_owner));
  perform pg_temp.ok('marketplace.other_cannot_read_sold',  n_sold_other = 0, format('n=%s', n_sold_other));
  perform pg_temp.ok('marketplace.other_cannot_edit_listing', hijack,           null);
end $$;

-- ── reservations ─────────────────────────────────────────────────────────────
-- Held/confirmed reservations are readable by anyone (public availability).
-- Facility staff see everything at their facility; a manager rank is required
-- to modify.

do $$
declare n_anon int; n_staff int; n_other_facility int; cancelled_by_other boolean;
begin
  perform pg_temp.as_anon();
  select count(*) into n_anon from public.reservations where id = 'ad000000-0000-0000-0000-000000000001';
  perform pg_temp.as_postgres();

  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000005');
  select count(*) into n_staff from public.reservations where id = 'ad000000-0000-0000-0000-000000000001';
  perform pg_temp.as_postgres();

  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000002');
  cancelled_by_other := pg_temp.denied(
    $q$update public.reservations set status = 'cancelled'
        where id = 'ad000000-0000-0000-0000-000000000001'$q$);
  perform pg_temp.as_postgres();

  -- Documents an intentional exposure rather than asserting privacy: a
  -- confirmed reservation leaks organizer_id, facility and time slot to anon.
  perform pg_temp.ok('reservations.anon_reads_confirmed_by_design', n_anon = 1,
                     format('anon saw %s; policy is status IN (held, confirmed) with no auth check', n_anon));
  perform pg_temp.ok('reservations.facility_staff_reads',        n_staff = 1, format('n=%s', n_staff));
  perform pg_temp.ok('reservations.other_cannot_cancel',         cancelled_by_other, null);
end $$;

-- Staff rank must not be enough to modify -- that needs manager.
do $$
declare staff_modified boolean;
begin
  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000005');
  staff_modified := pg_temp.denied(
    $q$update public.reservations set max_players = 2
        where id = 'ad000000-0000-0000-0000-000000000001'$q$);
  perform pg_temp.as_postgres();
  perform pg_temp.ok('reservations.staff_rank_cannot_modify', staff_modified,
                     'is_facility_role_at_least(..., manager) must reject staff');
end $$;

-- ── v_mutual_matches (regression for 20260824130000) ─────────────────────────
-- The view ran as its owner with no auth.uid() predicate, so anon could read
-- every mutual match in the system while the base table correctly returned 0.
-- These three assertions together are what that bug would have failed.

do $$
declare n_anon_view bigint; n_anon_table bigint; n_owner_view bigint; n_third_party bigint;
begin
  perform pg_temp.as_anon();
  -- Uses pg_temp.visible() because the migration REVOKEs anon outright, so this
  -- now raises permission-denied rather than returning zero rows. Both are a
  -- pass; -1 records that the grant itself is gone.
  n_anon_view  := pg_temp.visible('select 1 from public.v_mutual_matches');
  n_anon_table := pg_temp.visible('select 1 from public.matchmaking_swipes');
  perform pg_temp.as_postgres();

  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000001');
  select count(*) into n_owner_view from public.v_mutual_matches;
  perform pg_temp.as_postgres();

  -- A user uninvolved in the pair must see nothing, even though the rows exist.
  perform pg_temp.as_user('aa000000-0000-0000-0000-000000000003');
  select count(*) into n_third_party from public.v_mutual_matches;
  perform pg_temp.as_postgres();

  perform pg_temp.ok('v_mutual_matches.anon_sees_nothing',       n_anon_view <= 0,
                     case when n_anon_view < 0 then 'anon has no SELECT grant (revoked)'
                          else format('anon saw %s rows through the view', n_anon_view) end);
  perform pg_temp.ok('v_mutual_matches.base_table_denies_anon',  n_anon_table <= 0, format('n=%s', n_anon_table));
  perform pg_temp.ok('v_mutual_matches.participant_sees_own',    n_owner_view >= 1,
                     format('participant saw %s rows', n_owner_view));
  perform pg_temp.ok('v_mutual_matches.third_party_sees_nothing', n_third_party = 0,
                     format('uninvolved user saw %s rows', n_third_party));
end $$;

-- ── SECURITY DEFINER hygiene ─────────────────────────────────────────────────
-- A SECURITY DEFINER function without a pinned search_path resolves unqualified
-- names through the caller's search_path while running as the owner. Extension-
-- owned functions (PostGIS) are excluded -- they are not ours to change.

do $$
declare n_missing int; missing_names text;
begin
  select count(*), coalesce(string_agg(p.proname, ', ' order by p.proname), '')
    into n_missing, missing_names
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
  where n.nspname = 'public'
    and p.prosecdef
    and d.objid is null
    and (p.proconfig is null
         or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));

  perform pg_temp.ok('secdef.all_have_pinned_search_path', n_missing = 0,
                     case when n_missing = 0 then 'none'
                          else format('%s missing: %s', n_missing, missing_names) end);
end $$;

-- Any view reachable by anon or authenticated that runs as its owner is a
-- potential RLS bypass. Each one must be a deliberate, documented choice --
-- this test lists them so a newly added one has to be justified, not
-- discovered in production.
do $$
declare n_views int; view_names text;
begin
  select count(*), coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    into n_views, view_names
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  -- Extension-owned views (PostGIS geometry_columns / geography_columns) are
  -- not ours to change and would otherwise sit here as permanent noise.
  left join pg_depend d on d.objid = c.oid and d.deptype = 'e'
  where n.nspname = 'public' and c.relkind = 'v'
    and d.objid is null
    and coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name = 'security_invoker'), 'false') = 'false'
    and (has_table_privilege('anon', c.oid, 'SELECT')
      or has_table_privilege('authenticated', c.oid, 'SELECT'));

  -- Known and accepted: play_participants_public / _authenticated are curated
  -- public projections, and v_mutual_matches is definer on purpose so it can
  -- read blocked_users -- it carries its own auth.uid() predicate instead.
  perform pg_temp.ok('secdef.definer_views_are_known', n_views <= 3,
                     format('%s definer view(s) exposed: %s', n_views, view_names));
end $$;

-- ── Summary ──────────────────────────────────────────────────────────────────

select test_name,
       case when passed then 'PASS' else 'FAIL' end as result,
       coalesce(detail, '') as detail
from rls_results
order by passed, test_name;

select count(*) filter (where passed)     as passed,
       count(*) filter (where not passed) as failed,
       count(*)                           as total
from rls_results;

-- Non-zero exit on any failure, so CI fails loudly rather than printing FAIL
-- into a log nobody reads.
do $$
declare n_failed int;
begin
  select count(*) into n_failed from rls_results where not passed;
  if n_failed > 0 then
    raise exception 'RLS permission matrix: % test(s) failed', n_failed;
  end if;
end $$;
