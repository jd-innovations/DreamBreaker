-- Campaign alert emails — Phase 7 of PUSH_BROADCAST_IMPLEMENTATION_PLAN.md
-- (decision 17, email only for now: the owner deferred Sentry in edge
-- functions on 2026-09-22).
--
-- A pg_cron job (next migration) runs send_campaign_alerts() every 5 minutes.
-- It emails support@pickleballapp.app ONCE per campaign per kind:
--
--   failed             the campaign ended `failed`
--   high_failure_rate  finished with failed / (accepted + failed) > 20%.
--                      invalid_token is churn, not failure (as in finalize),
--                      so it is left out of both sides
--   stalled            broadcasts ON, work due (queued, or retry_pending past
--                      its time), and no delivery row has changed for 10 min.
--                      Raises no exception anywhere — nothing is throwing,
--                      work simply stopped — which is why a cron job looks
--   paused             broadcasts OFF while a campaign is mid-send. Pausing
--                      is legitimate; forgetting is not. One reminder
--   scheduler_missed   broadcasts ON and a scheduled campaign is 10+ min past
--                      its time without being queued
--
-- Only campaigns active in the last 7 days are considered, so turning this on
-- never mails about history.
--
-- Each alert is recorded as an `alert_sent` row in campaign_audit_log
-- (metadata.kind) — the audit trail and the de-duplication in one place. A
-- campaign that stalls, recovers and stalls again is NOT re-alerted; the
-- first email is the one that matters, and the runbook covers re-checking.
--
-- Email carries the campaign id, status, counts and an admin link — never the
-- title, body or any token. It is sent through fn_send_transactional_email,
-- which carries the Vault dispatch secret (20260922140000), so it passes the
-- email gate in both log and enforce mode.

create or replace function public.send_campaign_alerts()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_to constant text := 'support@pickleballapp.app';
  c_admin constant text := 'https://pickleballapp.app/admin/notifications/';
  v_on boolean := private.push_broadcast_enabled();
  r record;
  v_sent integer := 0;
  v_label text;
begin
  for r in
    with base as (
      select c.id, c.status, c.scheduled_at, c.queued_at, c.started_at, c.completed_at,
             c.recipient_device_count,
             count(d.id) filter (where d.status = 'accepted') as accepted,
             count(d.id) filter (where d.status = 'failed') as failed,
             count(d.id) filter (where d.status = 'invalid_token') as invalid,
             count(d.id) filter (where d.status = 'queued'
                                    or (d.status = 'retry_pending' and d.next_attempt_at <= now())) as due,
             max(d.updated_at) as last_progress
        from public.notification_campaigns c
        left join public.campaign_deliveries d on d.campaign_id = c.id
       where coalesce(c.completed_at, c.aborted_at, c.queued_at, c.scheduled_at, c.created_at)
               > now() - interval '7 days'
       group by c.id
    ), candidates as (
      select b.*, 'failed'::text as kind from base b
       where b.status = 'failed'
      union all
      select b.*, 'high_failure_rate' from base b
       where b.status in ('sent', 'partially_failed')
         and (b.accepted + b.failed) > 0
         and b.failed::numeric / (b.accepted + b.failed) > 0.2
      union all
      select b.*, 'stalled' from base b
       where v_on
         and b.status in ('queuing', 'sending')
         and b.due > 0
         and coalesce(b.last_progress, b.started_at, b.queued_at) < now() - interval '10 minutes'
      union all
      select b.*, 'paused' from base b
       where not v_on
         and b.status in ('queuing', 'sending')
      union all
      select b.*, 'scheduler_missed' from base b
       where v_on
         and b.status = 'scheduled'
         and b.scheduled_at < now() - interval '10 minutes'
    )
    select k.* from candidates k
     where not exists (
       select 1 from public.campaign_audit_log a
        where a.campaign_id = k.id and a.action = 'alert_sent' and a.metadata->>'kind' = k.kind
     )
     order by k.id, k.kind
  loop
    v_label := case r.kind
      when 'failed' then 'Campaign failed'
      when 'high_failure_rate' then 'High failure rate'
      when 'stalled' then 'Send queue stalled'
      when 'paused' then 'Campaign paused (broadcasts switched off)'
      when 'scheduler_missed' then 'Scheduled campaign not started'
    end;

    perform public.fn_send_transactional_email(jsonb_build_object(
      'to', c_to,
      'subject', '[Push alert] ' || v_label || ' — ' || left(r.id::text, 8),
      'html',
        '<p><strong>' || v_label || '</strong></p>'
        || '<p>Campaign <code>' || r.id::text || '</code><br>'
        || 'Status: ' || r.status || '<br>'
        || 'Devices: ' || coalesce(r.recipient_device_count::text, '—')
        || ' · accepted ' || r.accepted || ' · failed ' || r.failed
        || ' · uninstalled ' || r.invalid || ' · still due ' || r.due || '</p>'
        || '<p><a href="' || c_admin || r.id::text || '">Open in admin</a> · '
        || 'see docs/PUSH_BROADCAST_RUNBOOK.md</p>'
    ));

    perform private.write_campaign_audit(
      r.id, null, 'alert_sent',
      jsonb_build_object('kind', r.kind, 'status', r.status, 'accepted', r.accepted,
                         'failed', r.failed, 'due', r.due)
    );
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.send_campaign_alerts() from public, anon, authenticated;
grant execute on function public.send_campaign_alerts() to service_role;
