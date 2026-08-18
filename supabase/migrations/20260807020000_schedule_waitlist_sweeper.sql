-- Schedule waitlist-sweeper via pg_cron, mirroring the existing
-- generate-dynamic-stories job pattern (migrations_legacy/20260709000002).
-- The function itself was fixed in the previous migration/pass to route
-- email through send-transactional-email instead of its old broken,
-- mis-branded local sender. It was never scheduled anywhere before this.

select cron.schedule(
  'waitlist-sweeper',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/waitlist-sweeper',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo'
    ),
    body := '{}'::jsonb
  );
  $$
);
