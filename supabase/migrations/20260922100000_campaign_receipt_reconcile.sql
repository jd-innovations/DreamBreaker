-- Campaign receipt reconciliation and 90-day prune — Phase 4 of
-- PUSH_BROADCAST_IMPLEMENTATION_PLAN.md, as re-specified 2026-09-22 (see that
-- phase's Status box for why it differs from the plan's original text).
--
-- The model, against what Phase 3 actually built:
--
--   accepted        Expo issued a ticket. Set by the worker; means "Expo took it".
--   reconciled_at   the receipt arrived. provider_receipt_status says what it was.
--   receipt 'ok'    stays accepted — now confirmed.
--   DeviceNotRegistered receipt → invalid_token (push-receipt-sweeper has
--                   already deleted the token; nothing here deletes tokens).
--   any other receipt error → failed, with Expo's code. The campaign's own
--                   status (sent / partially_failed) is NOT revisited: it is the
--                   verdict at send time, and the summary reports receipts
--                   separately.
--   unconfirmed     accepted, no 'ok' receipt, and past Expo's 24h receipt
--                   window. DERIVED in admin_campaign_summary — no job
--                   relabels rows, because `submitted` is only ever a
--                   seconds-long in-flight state here.
--
-- ── The live DM path is not touched ─────────────────────────────────────────
--
-- push-receipt-sweeper already checks every unchecked push_tickets row, whoever
-- wrote it, and deletes tokens on DeviceNotRegistered. So campaign tickets need
-- only to BE in push_tickets. Copying receipts onto campaign_deliveries is a
-- separate SQL function on its own cron job (next migration): a failure there
-- cannot touch the sweeper's token cleanup, and the sweeper needs no deploy.
--
-- ── Why counts are frozen onto the campaign row ─────────────────────────────
--
-- Every outcome count was computed live from campaign_deliveries. The 90-day
-- prune deletes those rows, so without a frozen copy it would erase every old
-- campaign's results. freeze_campaign_stats() snapshots them once a campaign is
-- terminal and past the receipt window; the prune refuses any campaign that has
-- no snapshot.

-- ─── push_tickets.campaign_delivery_id ──────────────────────────────────────

alter table public.push_tickets
  add column if not exists campaign_delivery_id uuid
    references public.campaign_deliveries(id) on delete set null;

comment on column public.push_tickets.campaign_delivery_id is
  'Set for tickets from admin push campaigns (worker_record_results); null for message and '
  'price-drop pushes. reconcile_campaign_receipts() copies the receipt onto that delivery.';

create index if not exists push_tickets_campaign_delivery_idx
  on public.push_tickets (campaign_delivery_id)
  where campaign_delivery_id is not null;

-- ─── Frozen outcome counts on notification_campaigns ────────────────────────

alter table public.notification_campaigns
  add column if not exists stats_frozen_at             timestamptz,
  add column if not exists stats_accepted              integer check (stats_accepted >= 0),
  add column if not exists stats_receipt_ok            integer check (stats_receipt_ok >= 0),
  add column if not exists stats_unconfirmed           integer check (stats_unconfirmed >= 0),
  add column if not exists stats_failed                integer check (stats_failed >= 0),
  add column if not exists stats_receipt_failed        integer check (stats_receipt_failed >= 0),
  add column if not exists stats_invalid_token         integer check (stats_invalid_token >= 0),
  add column if not exists stats_skipped               integer check (stats_skipped >= 0),
  add column if not exists stats_tap_capable_accepted  integer check (stats_tap_capable_accepted >= 0);

comment on column public.notification_campaigns.stats_frozen_at is
  'When the stats_* outcome counts were snapshotted from campaign_deliveries '
  '(freeze_campaign_stats). Null = counts are still live. prune_campaign_deliveries '
  'never deletes a campaign''s deliveries while this is null.';

-- ─── Prune switch ───────────────────────────────────────────────────────────
--
-- Ships OFF: the prune runs daily and records what it WOULD delete. Anything
-- but the exact text 'true' reads as off.

insert into public.platform_settings (key, value, value_type, label, description, sort_order)
values (
  'campaign_delivery_prune_enabled', 'false', 'boolean',
  'Prune old campaign deliveries',
  'Deletes per-device push campaign rows 90 days after a campaign ends. Off: the daily job only records what it would delete. Campaign totals and the audit log are always kept.',
  941
)
on conflict (key) do nothing;

-- ─── worker_record_results: also write push_tickets ─────────────────────────
--
-- Replaced whole (20260921210000); one addition at the end. Accepted rows get
-- a push_tickets row carrying campaign_delivery_id, so the sweeper asks Expo
-- for their receipts.
--
-- The ticket insert runs in its own exception block. It is bookkeeping: if it
-- failed inside the main statement's transaction, the outcome update would roll
-- back with it, the rows would stay `submitted`, and finalize would fail them
-- as `interrupted` — a delivered push recorded as lost. A failed ticket write
-- only costs that delivery its receipt (it reports as unconfirmed).

create or replace function public.worker_record_results(p_campaign_id uuid, p_results jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_accepted integer := 0;
  v_retry integer := 0;
  v_exhausted integer := 0;
  v_invalid integer := 0;
  v_failed integer := 0;
  v_dead text[];
  v_accepted_ids uuid[];
begin
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'p_results must be an array' using errcode = '22023';
  end if;

  with r as (
    select (e->>'id')::uuid as id,
           e->>'outcome' as outcome,
           left(e->>'ticket_id', 100) as ticket_id,
           left(e->>'error_code', 80) as error_code,
           left(e->>'error_message', 500) as error_message
      from jsonb_array_elements(p_results) e
  ), upd as (
    update public.campaign_deliveries d
       set status = case
             when r.outcome = 'accepted' then 'accepted'
             when r.outcome = 'invalid_token' then 'invalid_token'
             when r.outcome = 'retry' and d.attempt_count < private.campaign_max_attempts() then 'retry_pending'
             else 'failed'
           end,
           ticket_id = case when r.outcome = 'accepted' then r.ticket_id else d.ticket_id end,
           next_attempt_at = case
             when r.outcome = 'retry' and d.attempt_count < private.campaign_max_attempts()
               then now() + private.campaign_retry_delay(d.attempt_count)
             else null
           end,
           error_code = case
             when r.outcome = 'accepted' then null
             when r.outcome = 'retry' and d.attempt_count >= private.campaign_max_attempts()
               then coalesce(r.error_code, 'max_attempts')
             else r.error_code
           end,
           error_message = case when r.outcome = 'accepted' then null else r.error_message end
      from r
     where d.id = r.id
       and d.campaign_id = p_campaign_id
       and d.status = 'submitted'
       and r.outcome in ('accepted', 'retry', 'invalid_token', 'failed')
    returning d.id, d.status, r.outcome, d.expo_push_token
  )
  select
    count(*) filter (where status = 'accepted'),
    count(*) filter (where status = 'retry_pending'),
    count(*) filter (where status = 'failed' and outcome = 'retry'),
    count(*) filter (where status = 'invalid_token'),
    count(*) filter (where status = 'failed' and outcome = 'failed'),
    array_agg(expo_push_token) filter (where status = 'invalid_token'),
    array_agg(id) filter (where status = 'accepted')
    into v_accepted, v_retry, v_exhausted, v_invalid, v_failed, v_dead, v_accepted_ids
    from upd;

  if v_dead is not null then
    delete from public.push_tokens where expo_push_token = any(v_dead);
  end if;

  if v_accepted_ids is not null then
    begin
      insert into public.push_tickets (ticket_id, expo_push_token, campaign_delivery_id)
      select d.ticket_id, d.expo_push_token, d.id
        from public.campaign_deliveries d
       where d.id = any(v_accepted_ids)
         and d.ticket_id is not null
      on conflict (ticket_id) do nothing;
    exception when others then
      raise warning 'worker_record_results: push_tickets insert failed for campaign %: %',
        p_campaign_id, sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'accepted', v_accepted, 'retry_pending', v_retry, 'exhausted', v_exhausted,
    'invalid_token', v_invalid, 'failed', v_failed
  );
end;
$$;

-- ─── reconcile_campaign_receipts ────────────────────────────────────────────
--
-- Copies every checked campaign ticket's receipt onto its delivery. Only rows
-- still `accepted` and not yet reconciled move, so a re-run changes nothing and
-- a missed run is caught up by the next (until prune_push_tickets drops the
-- ticket at 24h — the sweeper checks tickets within minutes, so the margin is
-- nearly a day). Message-push tickets (null campaign_delivery_id) are never read.
--
-- Returns counts: { reconciled, ok, invalid_token, failed }.

create or replace function public.reconcile_campaign_receipts()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ok integer := 0;
  v_invalid integer := 0;
  v_failed integer := 0;
  v_other integer := 0;
begin
  with src as (
    select t.campaign_delivery_id as delivery_id, t.status as receipt_status,
           t.error_code as receipt_error, t.checked_at
      from public.push_tickets t
     where t.campaign_delivery_id is not null
       and t.checked_at is not null
  ), upd as (
    update public.campaign_deliveries d
       set provider_receipt_status = left(coalesce(src.receipt_status, 'unknown'), 40),
           reconciled_at = src.checked_at,
           status = case
             when src.receipt_status = 'error' and src.receipt_error = 'DeviceNotRegistered' then 'invalid_token'
             when src.receipt_status = 'error' then 'failed'
             else d.status
           end,
           error_code = case
             when src.receipt_status = 'error' then left(coalesce(src.receipt_error, 'receipt_error'), 80)
             else d.error_code
           end,
           error_message = case
             when src.receipt_status = 'error' then 'Expo receipt'
             else d.error_message
           end
      from src
     where d.id = src.delivery_id
       and d.status = 'accepted'
       and d.reconciled_at is null
    returning d.status, d.provider_receipt_status
  )
  select count(*) filter (where provider_receipt_status = 'ok'),
         count(*) filter (where status = 'invalid_token'),
         count(*) filter (where status = 'failed'),
         count(*) filter (where status = 'accepted' and provider_receipt_status <> 'ok')
    into v_ok, v_invalid, v_failed, v_other
    from upd;

  return jsonb_build_object(
    'reconciled', v_ok + v_invalid + v_failed + v_other,
    'ok', v_ok, 'invalid_token', v_invalid, 'failed', v_failed
  );
end;
$$;

-- ─── freeze_campaign_stats ──────────────────────────────────────────────────
--
-- Snapshots outcome counts onto finished campaigns once nothing can change
-- them: terminal, ended over 25 hours ago (past Expo's 24h receipt window plus
-- the sweeper's cadence), and no row still in flight. A campaign with an
-- orphaned in-flight row is never frozen — and so never pruned — rather than
-- frozen with a count that hides it. Returns how many campaigns were frozen.
--
-- Taps are not frozen: campaign_taps is never pruned, so they stay live.

create or replace function public.freeze_campaign_stats()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_frozen integer;
begin
  with due as (
    select c.id
      from public.notification_campaigns c
     where c.stats_frozen_at is null
       and c.status in ('sent', 'partially_failed', 'failed', 'aborted', 'cancelled')
       and coalesce(c.completed_at, c.aborted_at, c.cancelled_at) < now() - interval '25 hours'
       and not exists (
         select 1 from public.campaign_deliveries d
          where d.campaign_id = c.id
            and d.status in ('queued', 'retry_pending', 'submitted')
       )
     for update of c skip locked
  ), counts as (
    select due.id,
           count(d.id) filter (where d.status = 'accepted') as accepted,
           count(d.id) filter (where d.status = 'accepted' and d.provider_receipt_status = 'ok') as receipt_ok,
           count(d.id) filter (where d.status = 'accepted' and d.provider_receipt_status is distinct from 'ok') as unconfirmed,
           count(d.id) filter (where d.status = 'failed') as failed,
           count(d.id) filter (where d.status = 'failed' and d.reconciled_at is not null) as receipt_failed,
           count(d.id) filter (where d.status = 'invalid_token') as invalid_token,
           count(d.id) filter (where d.status = 'skipped') as skipped,
           count(d.id) filter (where d.status = 'accepted' and d.tap_capable) as tap_capable_accepted
      from due
      left join public.campaign_deliveries d on d.campaign_id = due.id
     group by due.id
  )
  update public.notification_campaigns c
     set stats_frozen_at = now(),
         stats_accepted = counts.accepted,
         stats_receipt_ok = counts.receipt_ok,
         stats_unconfirmed = counts.unconfirmed,
         stats_failed = counts.failed,
         stats_receipt_failed = counts.receipt_failed,
         stats_invalid_token = counts.invalid_token,
         stats_skipped = counts.skipped,
         stats_tap_capable_accepted = counts.tap_capable_accepted
    from counts
   where c.id = counts.id;

  get diagnostics v_frozen = row_count;
  return v_frozen;
end;
$$;

-- ─── prune_campaign_deliveries ──────────────────────────────────────────────
--
-- Decision 13: per-device rows are kept 90 days, then deleted. Age is measured
-- from when the CAMPAIGN ended, not per row, so a campaign's detail goes all at
-- once rather than in slices. Only campaigns that are terminal AND frozen are
-- eligible; campaigns with old detail but no frozen counts are refused and
-- reported.
--
-- Off by default (platform_settings.campaign_delivery_prune_enabled): it then
-- deletes nothing and records what it would have deleted. Every run writes one
-- audit row (campaign_id null) so the log shows the job is alive; a real
-- delete also writes one row per campaign. The audit log and campaign_taps are
-- never touched.

create or replace function public.prune_campaign_deliveries()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_campaign record;
  v_deleted integer;
  v_campaigns integer := 0;
  v_rows integer := 0;
  v_refused integer;
  v_result jsonb;
begin
  v_enabled := coalesce(
    (select value = 'true' from public.platform_settings where key = 'campaign_delivery_prune_enabled'),
    false
  );

  for v_campaign in
    select c.id,
           (select count(*) from public.campaign_deliveries d where d.campaign_id = c.id) as n_rows
      from public.notification_campaigns c
     where c.stats_frozen_at is not null
       and c.status in ('sent', 'partially_failed', 'failed', 'aborted', 'cancelled')
       and coalesce(c.completed_at, c.aborted_at, c.cancelled_at) < now() - interval '90 days'
       and exists (select 1 from public.campaign_deliveries d where d.campaign_id = c.id)
     order by coalesce(c.completed_at, c.aborted_at, c.cancelled_at)
  loop
    v_campaigns := v_campaigns + 1;
    if v_enabled then
      delete from public.campaign_deliveries where campaign_id = v_campaign.id;
      get diagnostics v_deleted = row_count;
      v_rows := v_rows + v_deleted;
      perform private.write_campaign_audit(
        v_campaign.id, null, 'deliveries_pruned', jsonb_build_object('deleted', v_deleted)
      );
    else
      v_rows := v_rows + v_campaign.n_rows;
    end if;
  end loop;

  -- Old detail the prune will not touch because its counts were never frozen.
  select count(*) into v_refused
    from public.notification_campaigns c
   where c.stats_frozen_at is null
     and coalesce(c.completed_at, c.aborted_at, c.cancelled_at, c.created_at) < now() - interval '90 days'
     and exists (select 1 from public.campaign_deliveries d where d.campaign_id = c.id);

  v_result := jsonb_build_object(
    'mode', case when v_enabled then 'delete' else 'dry_run' end,
    'campaigns', v_campaigns,
    'deliveries', v_rows,
    'refused_unfrozen', v_refused
  );

  perform private.write_campaign_audit(null, null, 'deliveries_prune_run', v_result);
  return v_result;
end;
$$;

-- ─── admin_campaign_summary: receipt columns and frozen counts ──────────────
--
-- Return shape changes, so drop and recreate (no caller exists until Phase 5).
-- Once a campaign is frozen, outcome counts come from its stats_* columns —
-- the delivery rows may have been pruned. Before that, counts are live, and:
--
--   receipt_ok       accepted, receipt 'ok'
--   receipt_pending  accepted, no receipt yet, still inside the 24h window
--   unconfirmed      accepted, no 'ok' receipt, window closed — Expo never said
--   receipt_failed   failed BY a receipt (subset of failed)

drop function if exists public.admin_campaign_summary(uuid);

create function public.admin_campaign_summary(p_campaign_id uuid default null)
returns table (
  campaign_id uuid,
  internal_name text,
  status text,
  audience_type text,
  audience_platform text,
  recipient_user_count integer,
  recipient_device_count integer,
  excluded_unknown_platform_count integer,
  queued bigint,
  submitted bigint,
  accepted bigint,
  retry_pending bigint,
  failed bigint,
  invalid_token bigint,
  skipped bigint,
  receipt_ok bigint,
  receipt_pending bigint,
  unconfirmed bigint,
  receipt_failed bigint,
  tap_capable_accepted bigint,
  taps bigint,
  stats_frozen_at timestamptz,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with live as (
    select
      c.id,
      count(d.id) filter (where d.status = 'queued') as queued,
      count(d.id) filter (where d.status = 'submitted') as submitted,
      count(d.id) filter (where d.status = 'accepted') as accepted,
      count(d.id) filter (where d.status = 'retry_pending') as retry_pending,
      count(d.id) filter (where d.status = 'failed') as failed,
      count(d.id) filter (where d.status = 'invalid_token') as invalid_token,
      count(d.id) filter (where d.status = 'skipped') as skipped,
      count(d.id) filter (where d.status = 'accepted' and d.provider_receipt_status = 'ok') as receipt_ok,
      count(d.id) filter (where d.status = 'accepted' and d.reconciled_at is null
                            and d.submitted_at >= now() - interval '24 hours') as receipt_pending,
      count(d.id) filter (where d.status = 'accepted' and d.provider_receipt_status is distinct from 'ok'
                            and (d.reconciled_at is not null or d.submitted_at < now() - interval '24 hours')) as unconfirmed,
      count(d.id) filter (where d.status = 'failed' and d.reconciled_at is not null) as receipt_failed,
      -- Tap-rate denominator (decision 8): accepted AND able to report a tap.
      count(d.id) filter (where d.status = 'accepted' and d.tap_capable) as tap_capable_accepted
    from public.notification_campaigns c
    left join public.campaign_deliveries d on d.campaign_id = c.id
    where p_campaign_id is null or c.id = p_campaign_id
    group by c.id
  )
  select
    c.id, c.internal_name, c.status, c.audience_type, c.audience_platform,
    c.recipient_user_count, c.recipient_device_count, c.excluded_unknown_platform_count,
    case when c.stats_frozen_at is null then l.queued else 0 end,
    case when c.stats_frozen_at is null then l.submitted else 0 end,
    case when c.stats_frozen_at is null then l.accepted else c.stats_accepted::bigint end,
    case when c.stats_frozen_at is null then l.retry_pending else 0 end,
    case when c.stats_frozen_at is null then l.failed else c.stats_failed::bigint end,
    case when c.stats_frozen_at is null then l.invalid_token else c.stats_invalid_token::bigint end,
    case when c.stats_frozen_at is null then l.skipped else c.stats_skipped::bigint end,
    case when c.stats_frozen_at is null then l.receipt_ok else c.stats_receipt_ok::bigint end,
    case when c.stats_frozen_at is null then l.receipt_pending else 0 end,
    case when c.stats_frozen_at is null then l.unconfirmed else c.stats_unconfirmed::bigint end,
    case when c.stats_frozen_at is null then l.receipt_failed else c.stats_receipt_failed::bigint end,
    case when c.stats_frozen_at is null then l.tap_capable_accepted else c.stats_tap_capable_accepted::bigint end,
    (select count(*) from public.campaign_taps t where t.campaign_id = c.id),
    c.stats_frozen_at, c.created_at, c.completed_at
  from public.notification_campaigns c
  join live l on l.id = c.id
  order by c.created_at desc;
end;
$$;

-- ─── admin_campaign_deliveries: add provider_receipt_status ─────────────────
--
-- Replaced whole (20260921190100) to return the receipt status next to
-- reconciled_at. Return shape changes, so drop and recreate.

drop function if exists public.admin_campaign_deliveries(uuid, integer, integer);

create function public.admin_campaign_deliveries(
  p_campaign_id uuid,
  p_limit integer default 200,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  token_masked text,
  status text,
  provider_receipt_status text,
  error_code text,
  error_message text,
  attempt_count integer,
  next_attempt_at timestamptz,
  app_version text,
  tap_capable boolean,
  submitted_at timestamptz,
  reconciled_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    d.id, d.user_id,
    -- "ExponentPushToken[abc…xyz]" → "…" + the last six characters inside the
    -- brackets. Enough to match a support report; useless for sending.
    '…' || right(rtrim(d.expo_push_token, ']'), 6),
    d.status, d.provider_receipt_status, d.error_code, d.error_message, d.attempt_count,
    d.next_attempt_at, d.app_version, d.tap_capable, d.submitted_at, d.reconciled_at, d.created_at
  from public.campaign_deliveries d
  where d.campaign_id = p_campaign_id
  order by d.created_at, d.id
  limit least(greatest(coalesce(p_limit, 200), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
--
-- REVOKE FROM PUBLIC does not remove grants Supabase's default privileges gave
-- anon and authenticated directly, so both are named.

revoke all on function public.worker_record_results(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.reconcile_campaign_receipts() from public, anon, authenticated;
revoke all on function public.freeze_campaign_stats() from public, anon, authenticated;
revoke all on function public.prune_campaign_deliveries() from public, anon, authenticated;
grant execute on function public.worker_record_results(uuid, jsonb) to service_role;
grant execute on function public.reconcile_campaign_receipts() to service_role;
grant execute on function public.freeze_campaign_stats() to service_role;
grant execute on function public.prune_campaign_deliveries() to service_role;

revoke all on function public.admin_campaign_summary(uuid) from public, anon;
revoke all on function public.admin_campaign_deliveries(uuid, integer, integer) from public, anon;
grant execute on function public.admin_campaign_summary(uuid) to authenticated;
grant execute on function public.admin_campaign_deliveries(uuid, integer, integer) to authenticated;
