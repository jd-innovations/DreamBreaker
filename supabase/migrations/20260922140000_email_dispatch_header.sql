-- Email relay remediation, step 1 — EMAIL_RELAY_REMEDIATION.md.
--
-- send-transactional-email was an open relay: its only gate was verify_jwt,
-- and the public anon key passes it. The fix gates the function on the caller
-- (supabase/functions/_shared/email-gate.ts). The database's way in is the
-- Vault dispatch secret the push functions already use.
--
-- fn_send_transactional_email is the ONLY database function that posts to the
-- sender (verified 2026-09-22: every email trigger calls this helper). It now
-- sends private.push_dispatch_headers() — the same headers the push triggers
-- send: Content-Type, the anon bearer the gateway's verify_jwt wants, and
-- x-dispatch-secret read from Vault at call time. No secret in this file.
--
-- Safe to apply before the gated function is deployed: today's sender ignores
-- a header it does not know.
--
-- ── And nobody but the database may call it ─────────────────────────────────
--
-- It was SECURITY DEFINER with EXECUTE granted to PUBLIC, anon and
-- authenticated: anyone could call it over the REST API with any `to` and raw
-- `html` — a second door into the same relay. Once it carries the dispatch
-- secret that door would pass the new gate, so EXECUTE is revoked here, in the
-- same change. Every legitimate caller (seven notify triggers, the
-- expire-stale-listings cron job) is itself SECURITY DEFINER owned by
-- postgres, so none of them runs with a user's privileges and none is affected.

create or replace function public.fn_send_transactional_email(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-transactional-email',
    headers := private.push_dispatch_headers(),
    body := p_payload
  );
end;
$$;

revoke all on function public.fn_send_transactional_email(jsonb) from public, anon, authenticated;
grant execute on function public.fn_send_transactional_email(jsonb) to service_role;
