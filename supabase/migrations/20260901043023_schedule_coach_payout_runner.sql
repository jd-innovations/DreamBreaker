-- Weekly coach payouts, per platform_settings coach_marketplace_payout_weekday
-- ('monday'). 15:00 UTC — mid-morning US Eastern, so a failed run is noticed
-- on a working day rather than overnight.
--
-- The runner is idempotent by construction: redemptions are claimed into a
-- batch before any transfer, each transfer carries the batch id as its Stripe
-- idempotency key, and a unique index on redemption_id makes paying the same
-- lesson twice impossible even if this fires concurrently with a manual run.
select cron.unschedule('coach-payout-runner')
 where exists (select 1 from cron.job where jobname = 'coach-payout-runner');

select cron.schedule(
  'coach-payout-runner',
  '0 15 * * 1',
  $$
  select net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/coach-payout-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo'
    ),
    body := '{}'::jsonb
  );
  $$
);
