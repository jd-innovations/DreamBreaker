-- Campaign alert cron job — Phase 7 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
-- Pure SQL; apply after 20260922150000_campaign_alerts.sql.
--
-- Runbook — stop alert email with no deploy:
--   select cron.unschedule('campaign-alerts');

select cron.schedule(
  'campaign-alerts',
  '*/5 * * * *',
  $$ select public.send_campaign_alerts(); $$
);
