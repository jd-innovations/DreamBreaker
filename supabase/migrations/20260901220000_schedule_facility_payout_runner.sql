-- Weekly facility payouts, per platform_settings
-- facility_marketplace_payout_weekday ('monday').
--
-- 15:30 UTC, thirty minutes after the coach runner rather than alongside it.
-- Both draw on the same platform balance, and two transfer runs firing at the
-- same instant is how one of them discovers an insufficient balance that was
-- sufficient a moment earlier. Same day, as decided; staggered so the failure
-- mode is not self-inflicted.
--
-- The runner is idempotent by construction: reservations are claimed into a
-- batch before any transfer, each transfer carries the batch id as its Stripe
-- idempotency key, and a unique index on reservation_id makes paying the same
-- booking twice impossible even if this fires alongside a manual run.
select cron.unschedule('facility-payout-runner')
 where exists (select 1 from cron.job where jobname = 'facility-payout-runner');

select cron.schedule(
  'facility-payout-runner',
  '30 15 * * 1',
  $$
  select net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/facility-payout-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo'
    ),
    body := '{}'::jsonb
  );
  $$
);
