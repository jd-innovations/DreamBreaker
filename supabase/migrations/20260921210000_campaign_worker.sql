-- Campaign worker state machine — Phase 3 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
--
-- The worker is split in two, deliberately:
--
--   process-campaign-batch (edge function)   talks to Expo. Nothing else.
--   these functions (service_role only)      every state transition: claim a
--                                            batch, record outcomes, retry
--                                            backoff, abort, finalize, schedule.
--
-- The state machine lives here because this is where the guarantees are: the
-- claim's FOR UPDATE SKIP LOCKED, the unique (campaign_id, expo_push_token),
-- conditional updates that only move rows the worker actually claimed. It is
-- also the half that can be tested in a rolled-back transaction without
-- sending a single notification.
--
-- DORMANT: the kill switch (platform_settings.push_broadcast_enabled) is seeded
-- FALSE and is turned on deliberately in Phase 7. With it off, the worker
-- claims nothing, the scheduler queues nothing and admin-campaign-send refuses.
-- The cron jobs are a separate migration, applied only after the worker
-- function is deployed (a job pointed at a missing function fails silently
-- every minute).

-- ─── Kill switch ────────────────────────────────────────────────────────────
--
-- A platform_settings row, so an admin can flip it from the existing settings
-- screen without a deploy. Anything but the exact text 'true' reads as off —
-- a typo must fail safe.

insert into public.platform_settings (key, value, value_type, label, description, sort_order)
values (
  'push_broadcast_enabled', 'false', 'boolean',
  'Push broadcasts',
  'Master switch for admin push campaigns. Off: nothing is sent, scheduled campaigns wait, and Send is refused. Campaigns already sending stop at their next batch.',
  940
)
on conflict (key) do nothing;

create or replace function private.push_broadcast_enabled()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select value = 'true' from public.platform_settings where key = 'push_broadcast_enabled'),
    false
  );
$$;

revoke all on function private.push_broadcast_enabled() from public;

-- ─── Budget ─────────────────────────────────────────────────────────────────
--
-- Retry policy lives here (the edge function holds the Expo-side budget).
-- Backoff doubles from 30s — 30, 60, 120 — each with ±20% jitter, so a provider
-- blip does not bring every retry back in the same second.

create or replace function private.campaign_max_attempts()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;

create or replace function private.campaign_retry_delay(p_attempt integer)
returns interval
language sql
volatile  -- random()
set search_path = ''
as $$
  select make_interval(secs => 30 * power(2, greatest(p_attempt, 1) - 1) * (0.8 + random() * 0.4));
$$;

revoke all on function private.campaign_max_attempts() from public;
revoke all on function private.campaign_retry_delay(integer) from public;

-- ─── Admin send refuses while the switch is off ─────────────────────────────
--
-- claim_campaign_send (20260921200000) replaced whole, adding one check: with
-- the kill switch off it returns { result: "disabled" } and changes nothing.
-- Everything else is unchanged.

create or replace function public.claim_campaign_send(
  p_campaign_id uuid,
  p_idempotency_key text,
  p_admin_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_key text;
  v_at timestamptz;
  v_devices integer;
begin
  if p_admin_id is null or not exists (
    select 1 from public.profiles where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not private.push_broadcast_enabled() then
    return jsonb_build_object('result', 'disabled');
  end if;

  update public.notification_campaigns
     set status = 'queuing', queued_at = now(), sent_by = p_admin_id
   where id = p_campaign_id
     and status = 'scheduled'
     and idempotency_key = p_idempotency_key
     and scheduled_at <= now() + interval '1 minute'
  returning id into v_id;

  if v_id is null then
    select status, idempotency_key, scheduled_at into v_status, v_key, v_at
      from public.notification_campaigns where id = p_campaign_id;

    if not found then
      return jsonb_build_object('result', 'not_found');
    elsif v_key is distinct from p_idempotency_key then
      return jsonb_build_object('result', 'key_mismatch');
    elsif v_status = 'scheduled' then
      return jsonb_build_object('result', 'not_due', 'scheduled_at', v_at);
    elsif v_status in ('queuing', 'sending', 'aborting', 'aborted', 'sent', 'partially_failed', 'failed') then
      return jsonb_build_object('result', 'already_claimed', 'status', v_status);
    else
      return jsonb_build_object('result', 'not_sendable', 'status', v_status);
    end if;
  end if;

  v_devices := public.snapshot_campaign_recipients(v_id);

  perform private.write_campaign_audit(
    v_id, p_admin_id, 'send_claimed', jsonb_build_object('recipient_device_count', v_devices)
  );

  return (
    select jsonb_build_object(
      'result', 'claimed',
      'recipient_user_count', recipient_user_count,
      'recipient_device_count', recipient_device_count,
      'excluded_unknown_platform_count', excluded_unknown_platform_count
    )
    from public.notification_campaigns where id = v_id
  );
end;
$$;

-- ─── Scheduler (pg_cron, pure SQL) ──────────────────────────────────────────
--
-- Queues every scheduled campaign whose time has come. The plan sketched a
-- campaign-scheduler edge function; it is not needed — this touches only the
-- database, so the cron job calls it directly and there is no HTTP hop, no
-- secret and no function to deploy.
--
-- The claim is the same conditional UPDATE as claim_campaign_send, per
-- campaign, so two overlapping scheduler runs (or a scheduler run racing an
-- admin's Send) cannot both queue one campaign. Each campaign commits or fails
-- on its own: one bad snapshot does not hold up the others.

create or replace function public.claim_due_campaigns()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidate uuid;
  v_id uuid;
  v_devices integer;
  v_claimed integer := 0;
begin
  if not private.push_broadcast_enabled() then
    return 0;  -- scheduled campaigns wait; an admin can cancel them
  end if;

  for v_candidate in
    select id from public.notification_campaigns
     where status = 'scheduled' and scheduled_at <= now()
     order by scheduled_at
     limit 20
  loop
    begin
      update public.notification_campaigns
         set status = 'queuing', queued_at = now()
       where id = v_candidate and status = 'scheduled' and scheduled_at <= now()
      returning id into v_id;

      if v_id is not null then
        v_devices := public.snapshot_campaign_recipients(v_id);
        -- actor null: the scheduler, acting on the admin's earlier schedule.
        perform private.write_campaign_audit(
          v_id, null, 'send_claimed',
          jsonb_build_object('recipient_device_count', v_devices, 'by', 'scheduler')
        );
        v_claimed := v_claimed + 1;
      end if;
    exception when others then
      -- Rolled back to this block: the campaign stays scheduled and is retried
      -- next minute. Logged, never swallowed silently.
      raise warning 'claim_due_campaigns: campaign % failed: %', v_candidate, sqlerrm;
    end;
  end loop;

  return v_claimed;
end;
$$;

-- ─── worker_active_campaigns ────────────────────────────────────────────────
--
-- What the worker should look at this run, oldest first. `aborting` is
-- included so an abort is carried out promptly even if nothing is left to send.

create or replace function public.worker_active_campaigns()
returns table (campaign_id uuid, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select id, status
    from public.notification_campaigns
   where status in ('queuing', 'sending', 'aborting')
   order by queued_at nulls last, created_at
   limit 10;
$$;

-- ─── worker_claim_batch ─────────────────────────────────────────────────────
--
-- Returns jsonb { state, campaign?, deliveries? }:
--
--   disabled     kill switch off — the worker should stop the whole run
--   aborted      the campaign was `aborting`; remaining rows are now skipped
--                and the campaign is `aborted`. Nothing to send.
--   inactive     not queuing/sending (finished, cancelled, …)
--   ok           `deliveries` is the batch (possibly empty = nothing due now)
--
-- The status is re-read on every batch, which is what makes abort take effect
-- "within one batch". FOR UPDATE SKIP LOCKED means two overlapping workers
-- claim disjoint rows; the claimed rows leave `queued`/`retry_pending` in the
-- same statement, so a later claim cannot see them either.

create or replace function public.worker_claim_batch(p_campaign_id uuid, p_limit integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_title text;
  v_body text;
  v_url text;
  v_skipped integer;
  v_batch jsonb;
begin
  if not private.push_broadcast_enabled() then
    return jsonb_build_object('state', 'disabled');
  end if;

  select status, title, body, destination_url
    into v_status, v_title, v_body, v_url
    from public.notification_campaigns
   where id = p_campaign_id
   for update;

  if not found then
    return jsonb_build_object('state', 'inactive');
  end if;

  if v_status = 'aborting' then
    update public.campaign_deliveries
       set status = 'skipped', next_attempt_at = null
     where campaign_id = p_campaign_id
       and status in ('queued', 'retry_pending');
    get diagnostics v_skipped = row_count;

    update public.notification_campaigns
       set status = 'aborted', aborted_at = now()
     where id = p_campaign_id;

    perform private.write_campaign_audit(
      p_campaign_id, null, 'aborted', jsonb_build_object('skipped', v_skipped)
    );
    return jsonb_build_object('state', 'aborted', 'skipped', v_skipped);
  end if;

  if v_status not in ('queuing', 'sending') then
    return jsonb_build_object('state', 'inactive');
  end if;

  if v_status = 'queuing' then
    update public.notification_campaigns
       set status = 'sending', started_at = coalesce(started_at, now())
     where id = p_campaign_id;
  end if;

  with claimed as (
    select id from public.campaign_deliveries
     where campaign_id = p_campaign_id
       and status in ('queued', 'retry_pending')
       and (next_attempt_at is null or next_attempt_at <= now())
     order by created_at, id
     limit greatest(least(coalesce(p_limit, 0), 1000), 0)
     for update skip locked
  ), moved as (
    update public.campaign_deliveries d
       set status = 'submitted',
           attempt_count = d.attempt_count + 1,
           submitted_at = now(),
           next_attempt_at = null
      from claimed
     where d.id = claimed.id
    returning d.id, d.expo_push_token
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'token', expo_push_token)), '[]'::jsonb)
    into v_batch
    from moved;

  return jsonb_build_object(
    'state', 'ok',
    'campaign', jsonb_build_object('title', v_title, 'body', v_body, 'url', v_url),
    'deliveries', v_batch
  );
end;
$$;

-- ─── worker_record_results ──────────────────────────────────────────────────
--
-- p_results: [{ id, outcome, ticket_id?, error_code?, error_message? }]
--
--   accepted       Expo issued a ticket. Final for this phase; Phase 4 reads
--                  the receipt.
--   retry          transient (network, 5xx, 429, MessageRateExceeded). Back to
--                  retry_pending with backoff — or failed at MAX_ATTEMPTS.
--   invalid_token  DeviceNotRegistered in the ticket. The token is deleted from
--                  push_tokens, as send-message-push does.
--   failed         permanent.
--
-- Only rows of THIS campaign that are currently `submitted` move — a result
-- for anything else is ignored, so a confused or replayed call cannot rewrite
-- finished deliveries. Error text is truncated to the column caps.

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
    returning d.status, r.outcome, d.expo_push_token
  )
  select
    count(*) filter (where status = 'accepted'),
    count(*) filter (where status = 'retry_pending'),
    count(*) filter (where status = 'failed' and outcome = 'retry'),
    count(*) filter (where status = 'invalid_token'),
    count(*) filter (where status = 'failed' and outcome = 'failed'),
    array_agg(expo_push_token) filter (where status = 'invalid_token')
    into v_accepted, v_retry, v_exhausted, v_invalid, v_failed, v_dead
    from upd;

  if v_dead is not null then
    delete from public.push_tokens where expo_push_token = any(v_dead);
  end if;

  return jsonb_build_object(
    'accepted', v_accepted, 'retry_pending', v_retry, 'exhausted', v_exhausted,
    'invalid_token', v_invalid, 'failed', v_failed
  );
end;
$$;

-- ─── worker_fail_campaign ───────────────────────────────────────────────────
--
-- Campaign-fatal errors (InvalidCredentials, MismatchSenderId): the fault is
-- ours, every further request would fail the same way, and retrying only burns
-- the budget. Unsent rows become skipped and the campaign `failed`. In-flight
-- rows finish on their own.

create or replace function public.worker_fail_campaign(p_campaign_id uuid, p_error_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_skipped integer;
begin
  update public.campaign_deliveries
     set status = 'skipped', next_attempt_at = null, error_code = left(p_error_code, 80)
   where campaign_id = p_campaign_id
     and status in ('queued', 'retry_pending');
  get diagnostics v_skipped = row_count;

  update public.notification_campaigns
     set status = 'failed', completed_at = now()
   where id = p_campaign_id
     and status in ('queuing', 'sending');

  perform private.write_campaign_audit(
    p_campaign_id, null, 'failed',
    jsonb_build_object('error_code', left(p_error_code, 80), 'skipped', v_skipped)
  );
end;
$$;

-- ─── worker_finalize_campaign ───────────────────────────────────────────────
--
-- Called after each run. Returns the campaign's status afterwards.
--
-- Still work to do (queued, retry_pending, or submitted within the last ten
-- minutes) → unchanged. Otherwise a terminal status from the delivery rows:
--
--   sent              something was accepted and nothing failed — or there
--                     was nobody to send to
--   partially_failed  accepted AND failed
--   failed            nothing accepted, something failed
--
-- invalid_token is not counted as a failure for this: an uninstalled app is
-- churn, not a delivery fault, and a campaign that reached every live device
-- has been sent.
--
-- A row still `submitted` after ten minutes means a worker died between
-- claiming and recording. It becomes failed ('interrupted'), NOT retried:
-- Expo may already have delivered it, and a missing broadcast is better than
-- a duplicate one.

create or replace function public.worker_finalize_campaign(p_campaign_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_accepted integer;
  v_failed integer;
  v_terminal text;
begin
  select status into v_status from public.notification_campaigns where id = p_campaign_id for update;
  if not found or v_status not in ('queuing', 'sending') then
    return v_status;
  end if;

  update public.campaign_deliveries
     set status = 'failed', error_code = 'interrupted'
   where campaign_id = p_campaign_id
     and status = 'submitted'
     and submitted_at < now() - interval '10 minutes';

  if exists (
    select 1 from public.campaign_deliveries
     where campaign_id = p_campaign_id
       and status in ('queued', 'retry_pending', 'submitted')
  ) then
    return v_status;
  end if;

  select count(*) filter (where status = 'accepted'),
         count(*) filter (where status = 'failed')
    into v_accepted, v_failed
    from public.campaign_deliveries
   where campaign_id = p_campaign_id;

  v_terminal := case
    when v_accepted > 0 and v_failed > 0 then 'partially_failed'
    when v_accepted = 0 and v_failed > 0 then 'failed'
    else 'sent'
  end;

  update public.notification_campaigns
     set status = v_terminal, completed_at = now()
   where id = p_campaign_id;

  perform private.write_campaign_audit(
    p_campaign_id, null, 'completed',
    jsonb_build_object('status', v_terminal, 'accepted', v_accepted, 'failed', v_failed)
  );

  return v_terminal;
end;
$$;

-- ─── Grants: service_role only ──────────────────────────────────────────────

revoke all on function public.claim_due_campaigns() from public, anon, authenticated;
revoke all on function public.worker_active_campaigns() from public, anon, authenticated;
revoke all on function public.worker_claim_batch(uuid, integer) from public, anon, authenticated;
revoke all on function public.worker_record_results(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.worker_fail_campaign(uuid, text) from public, anon, authenticated;
revoke all on function public.worker_finalize_campaign(uuid) from public, anon, authenticated;
grant execute on function public.claim_due_campaigns() to service_role;
grant execute on function public.worker_active_campaigns() to service_role;
grant execute on function public.worker_claim_batch(uuid, integer) to service_role;
grant execute on function public.worker_record_results(uuid, jsonb) to service_role;
grant execute on function public.worker_fail_campaign(uuid, text) to service_role;
grant execute on function public.worker_finalize_campaign(uuid) to service_role;
