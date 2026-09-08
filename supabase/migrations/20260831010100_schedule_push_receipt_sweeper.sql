-- Schedule push-receipt-sweeper, mirroring the waitlist-sweeper job
-- (20260807020000). TODO1.1 item 5.1.
--
-- Every 15 minutes. Expo keeps receipts for 24 hours, so the interval only has
-- to be short enough that a batch is never dropped for age — it is not a
-- latency-sensitive job. Nothing user-facing waits on it: its whole purpose is
-- to stop dead tokens accumulating, which matters over weeks rather than
-- minutes.

select cron.schedule(
  'push-receipt-sweeper',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/push-receipt-sweeper',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo'
    ),
    body := '{}'::jsonb
  );
  $$
);
