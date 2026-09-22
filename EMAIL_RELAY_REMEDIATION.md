# Email relay remediation

**Written for:** whoever deploys or maintains `send-transactional-email`. Found and
fixed 2026-09-22, while planning push-broadcast Phase 7 (whose alerts would send
through this function).

## The defect

`send-transactional-email` accepts `to`, `subject` and raw `html` and sends them
through Resend as `notifications@pickleballapp.app`. Its only gate was
`verify_jwt`, and the public anon key — shipped in the mobile app and the website —
passes it. Anyone could send any email to anyone from our domain. Verified live
with a request that could not send anything (empty body → `400 Missing to`, i.e.
past authentication).

A second door: `fn_send_transactional_email(jsonb)` was SECURITY DEFINER with
EXECUTE granted to PUBLIC, anon and authenticated, so the same could be done over
the REST API.

**Evidence of abuse:** none in `email_log` for the last 90 days (small volumes of
our own templates; 21 raw-HTML sends to one address on 2026-08-21, the email-shell
testing). `email_log` only records what the function logs — **Resend's dashboard
is the authoritative check.**

## The fix

| Caller | How it proves itself |
| --- | --- |
| Database (`fn_send_transactional_email`, used by 7 notify triggers + the `expire-stale-listings` cron) | Vault dispatch secret in `x-dispatch-secret` — the same secret and validator as the push functions |
| `cancel-registration`, `waitlist-sweeper`, web Stripe webhook route | Service-role key as the bearer, compared exactly with the function's own `SUPABASE_SERVICE_ROLE_KEY` |
| Admin pages (Communications composer, review invites, email preview) | Signed-in user, verified with `auth.getUser`, and `is_admin()` asked as that user |
| Anything else (anon key, non-admin user, nothing) | Refused in enforce mode |

Code: `supabase/functions/_shared/email-gate.ts` (`EMAIL_GATE_MODE`), wired in
`send-transactional-email/index.ts`; the two edge callers switched from the anon key
to the service-role key. Migration `20260922140000_email_dispatch_header.sql`.

## Rollout

1. **Migration — DONE 2026-09-22.** The helper sends the dispatch header, and EXECUTE
   is revoked from public/anon/authenticated. Verified: the anon key now gets
   `401 permission denied` on the RPC; triggers are unaffected (all SECURITY
   DEFINER, owned by postgres).
2. **Deploy in log mode** (owner, from the repo root on this branch):
   ```
   npx supabase functions deploy send-transactional-email cancel-registration waitlist-sweeper
   ```
3. **Watch the logs** for `[email-gate]` lines. Every real path must show `ok (dispatch)`,
   `ok (service)` or `ok (admin)`, and nothing real `would reject`. The admin path can
   be exercised safely from `/admin/email-preview` (a dry run sends nothing).
4. **Enforce:** set `EMAIL_GATE_MODE = "enforce"`, commit, and deploy
   `send-transactional-email` alone. Verify with the anon key → 401.

Rollback at any point: set the mode back to `"log"` and redeploy.

## Status

- [x] Migration applied, direct RPC closed
- [ ] Log-mode deploy
- [ ] Logs show every real caller allowed
- [ ] Enforce deploy + anon-key probe returns 401
