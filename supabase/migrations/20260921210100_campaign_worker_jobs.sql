-- Campaign cron jobs — Phase 3 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
--
-- APPLY ONLY AFTER process-campaign-batch IS DEPLOYED. A job pointed at a
-- missing function fails silently every minute.
--
-- Both jobs are inert while platform_settings.push_broadcast_enabled is
-- 'false' (the seeded value, until Phase 7).
--
-- ── Runbook: stop everything, no deploy ─────────────────────────────────────
--
--   select cron.unschedule('campaign-batch-worker');
--   select cron.unschedule('campaign-scheduler');
--
-- or flip the kill switch (admin settings, or
--   update platform_settings set value = 'false' where key = 'push_broadcast_enabled';).
-- A campaign interrupted either way resumes correctly when re-enabled: all of
-- its state is in campaign_deliveries.

-- Every minute: send. The HTTP call is made ONLY when the switch is on and a
-- campaign is active, so an idle system costs a cheap query, not an edge
-- invocation a minute. The job runs as postgres, which owns the private
-- helpers. The timeout comfortably exceeds the worker's own 50s budget so
-- pg_net records the real response.
select cron.schedule(
  'campaign-batch-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/process-campaign-batch',
    headers := private.push_dispatch_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  where private.push_broadcast_enabled()
    and exists (
      select 1 from public.notification_campaigns
       where status in ('queuing', 'sending', 'aborting')
    );
  $$
);

-- Every minute: queue scheduled campaigns whose time has come. Pure SQL — no
-- edge function (see claim_due_campaigns in 20260921210000).
select cron.schedule(
  'campaign-scheduler',
  '* * * * *',
  $$ select public.claim_due_campaigns(); $$
);
