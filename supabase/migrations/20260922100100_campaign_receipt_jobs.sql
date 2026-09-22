-- Campaign receipt cron jobs — Phase 4 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md.
--
-- Pure SQL, no edge functions: nothing to deploy first. Apply after
-- 20260922100000_campaign_receipt_reconcile.sql.
--
--   campaign-receipt-reconcile  every 15 min, offset 5 min from the sweeper
--                               (*/15) so each run sees the receipts the
--                               sweeper just fetched.
--   campaign-stats-freeze       daily 03:30 UTC.
--   campaign-delivery-prune     daily 04:00 UTC, after the freeze. Deletes
--                               nothing while campaign_delivery_prune_enabled
--                               is 'false' (the seeded value); it records what
--                               it would delete in campaign_audit_log
--                               (action 'deliveries_prune_run').
--
-- ── Runbook: stop deletion instantly, no deploy ─────────────────────────────
--
--   update platform_settings set value = 'false' where key = 'campaign_delivery_prune_enabled';
-- or
--   select cron.unschedule('campaign-delivery-prune');

select cron.schedule(
  'campaign-receipt-reconcile',
  '5,20,35,50 * * * *',
  $$ select public.reconcile_campaign_receipts(); $$
);

select cron.schedule(
  'campaign-stats-freeze',
  '30 3 * * *',
  $$ select public.freeze_campaign_stats(); $$
);

select cron.schedule(
  'campaign-delivery-prune',
  '0 4 * * *',
  $$ select public.prune_campaign_deliveries(); $$
);
