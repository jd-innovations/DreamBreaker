-- notification_push_log grows forever otherwise.
--
-- The table answers two questions: "has this person had their push for
-- today/this week" (24h and 7d windows) and "how often has this automation
-- fired" (the admin list shows 7-day and all-time counts). The first needs a
-- week; the second is the reason not to prune aggressively.
--
-- 180 days keeps roughly two quarters of per-automation history for the admin
-- screen — enough to judge whether a seasonal automation earns its place — and
-- is twenty-five times longer than any cap window. Same posture as
-- campaign-delivery-prune (20260922100100).
--
-- The all-time count in /admin/notifications becomes "all time, up to 180
-- days" after the first run. Said plainly here rather than discovered later by
-- someone wondering where the numbers went.
--
-- Verified: a 200-day-old row was deleted and a 10-day-old row kept.

create or replace function public.prune_notification_push_log()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare v_days integer; v_deleted integer;
begin
  v_days := coalesce(
    (select nullif(value, '')::int from public.platform_settings where key = 'push_log_retention_days'),
    180);

  delete from public.notification_push_log where sent_at < now() - make_interval(days => v_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_notification_push_log() from public, anon, authenticated;

insert into public.platform_settings (key, value, value_type, label, description, unit, sort_order)
values ('push_log_retention_days', '180', 'number', 'Push history retention',
        'How long per-send notification history is kept. The frequency caps only need a week; the rest is what the Automations list counts.',
        'days', 956)
on conflict (key) do nothing;

-- Daily, at a quiet hour, next to the other prune job.
select cron.schedule('notification-push-log-prune', '15 4 * * *',
                     $$select public.prune_notification_push_log();$$);
