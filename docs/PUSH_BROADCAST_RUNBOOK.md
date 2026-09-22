# Push Broadcast Runbook

**Written for:** the admin on call when a push campaign misbehaves, or when an alert
email arrives. Assumes admin access to the web dashboard and to the Supabase SQL
editor; no code knowledge needed for the first two sections.

Admin UI: **Admin → Push Campaigns** (`/admin/notifications`). Design and history:
`PUSH_BROADCAST_IMPLEMENTATION_PLAN.md` (each phase's Status box records what was
actually built).

---

## Ground rules

**1. A sent notification cannot be recalled.** Once Expo has accepted a message it
will be delivered. Every lever below stops what has *not* gone yet — none of them
takes anything back. If the wrong thing went out, the fix is a follow-up message,
not a recall.

**2. Stop first, diagnose second.** The kill switch is one click and changes nothing
irreversibly. If you are unsure whether something is wrong, turn it off, then look.

**3. Never "fix" a delivery by editing its row.** Status in `campaign_deliveries` is
written by the worker and the receipt reconciler. Hand edits hide the cause and can
make the worker re-send or skip. There is no UI-driven retry in V1 (decision 9) —
re-driving is a new campaign (see below).

**4. No tokens, ever.** Do not paste push tokens into tickets, chat or email. The
admin UI shows the last six characters on purpose; that is enough to match a report.

---

## Stop levers, fastest first

| Lever | How | Effect |
| --- | --- | --- |
| **Kill switch** | Admin → Settings → *Push broadcasts* → off. Or: `update platform_settings set value = 'false' where key = 'push_broadcast_enabled';` | No new campaign starts; a sending campaign stops at its next batch (within ~1 minute). Resumes where it left off when switched back on |
| **Abort one campaign** | Campaign page → **Abort** | Unsent deliveries become `skipped`; the campaign ends `aborted`. Already-sent messages still arrive |
| **Stop the worker** | `select cron.unschedule('campaign-batch-worker');` | All sending halts, no deploy. Re-create the job from `20260921210100_campaign_worker_jobs.sql` to resume |
| **Revert the admin UI** | Promote the previous Vercel deployment | Nobody can compose new campaigns |

A campaign paused by the kill switch sends a one-time **"paused"** alert so a
forgotten switch does not stall it silently.

---

## Alert emails

Sent to `support@pickleballapp.app` by the `campaign-alerts` cron job (every 5 min,
`send_campaign_alerts()`), once per campaign per kind. Each carries the campaign id,
status, counts and a link. Every alert is also an `alert_sent` row in the campaign's
audit history. Stop them with `select cron.unschedule('campaign-alerts');`.

### `failed` — the campaign ended failed

**Meaning.** Nothing was accepted, or a campaign-fatal error halted it
(`InvalidCredentials`, `MismatchSenderId`, `expo_unauthorized`: our Expo/APNs
credentials are wrong).

**Do.** Open the campaign → *Problems by cause*. If the cause is a credentials code,
**leave the kill switch off** — every campaign will fail the same way until the Expo
project's push credentials are fixed (Expo dashboard → project → Credentials). For
any other cause, see *Expo errors* below.

### `high_failure_rate` — more than 20% of sends failed

**Meaning.** The campaign finished, but failed / (accepted + failed) > 20%.
Uninstalled apps (`invalid_token`) are excluded — they are churn, not failure.

**Do.** *Problems by cause* on the campaign page. A single dominant code usually
names the problem (`MessageRateExceeded` → we sent too fast; `interrupted` → the
worker died mid-send). Decide whether the audience needs a follow-up campaign.

### `stalled` — work is due but nothing has moved for 10 minutes

**Meaning.** Broadcasts are on, the campaign has queued or due-for-retry rows, and no
delivery has changed in 10 minutes. Nothing throws an error in this state — work
simply stopped — which is why a cron job watches for it.

**Confirm.**
1. Is the worker job still scheduled? `select jobname, schedule, active from cron.job where jobname = 'campaign-batch-worker';`
2. Did it run and what did it get back? `select start_time, status, return_message from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'campaign-batch-worker') order by start_time desc limit 10;`
3. Edge function logs for `process-campaign-batch` (Supabase dashboard → Edge
   Functions → Logs). A 401 means the Vault dispatch secret and the function
   disagree; a 500 names its cause.

**Do.** Fix the cause; the campaign resumes on the next minute — all state is in the
delivery rows, so nothing is lost or duplicated. If it cannot be fixed quickly,
**Abort**.

### `paused` — broadcasts switched off mid-send

**Meaning.** Someone turned the kill switch off while this campaign was sending.

**Do.** If that was deliberate, nothing. Otherwise turn the switch back on; the
campaign continues. To drop it instead, **Abort**.

### `scheduler_missed` — a scheduled campaign never started

**Meaning.** Broadcasts are on and a campaign is 10+ minutes past its scheduled
time, still `scheduled`.

**Confirm.** `campaign-scheduler` job present and succeeding (same queries as for
`stalled`, with that job name). The scheduler is pure SQL (`claim_due_campaigns()`),
so a failure there shows in `cron.job_run_details.return_message`.

**Do.** Fix the cause and it is queued on the next minute. If the message is now
stale, **Cancel** it instead.

---

## Expo errors

Where a code appears: *send* = Expo refused the message up front (ticket); *receipt* =
Expo took it, then APNs/FCM refused it (checked by `push-receipt-sweeper` every 15
min and copied onto the campaign by `campaign-receipt-reconcile`).

| Code | Meaning | Retried? | Action |
| --- | --- | --- | --- |
| `DeviceNotRegistered` | App uninstalled or notifications revoked | No | None — the token is deleted automatically; the device leaves future audiences |
| `MessageRateExceeded`, `http_429` | We sent faster than Expo allows | Yes, with backoff | Watch for `high_failure_rate`; the worker already slows itself down |
| `network`, 5xx | Could not reach Expo | Yes, up to 3 attempts | Transient. If it persists, check Expo status |
| `max_attempts` | Retries exhausted | No | Usually an Expo outage; consider a follow-up campaign |
| `MessageTooBig` | Payload over 4 KB | No | Should be impossible (title ≤ 100, body ≤ 240). Report it as a bug |
| `InvalidCredentials`, `MismatchSenderId`, `expo_unauthorized` | Our credentials | No — the campaign halts | Fix credentials before anything else is sent |
| `interrupted` | A worker died after claiming rows | No (deliberately) | Those devices may or may not have received it — a missing broadcast is safer than a duplicate |
| `no_ticket`, `bad_response` | Expo answered unusably | No | Report it; include the campaign id |

**Unconfirmed** on the campaign page means Expo accepted the message but never
produced a receipt within its 24-hour window. It is not a failure; it is "Expo never
said".

---

## Re-driving a partially failed campaign

There is no retry button in V1. To reach devices that failed:

1. Make sure the cause is gone (see the tables above).
2. Create a **new** campaign with the same content (the composer's copy is quick).
3. Accept that devices that already received the first one will get it again —
   there is no "only the failed ones" audience in V1. If that is not acceptable,
   do not re-send.

---

## Uninstalled apps and dead tokens

`DeviceNotRegistered` — from a ticket at send time, or from a receipt later —
deletes that device's `push_tokens` row. Nothing else deletes tokens: other receipt
errors are our problem, not the device's, and deleting on them would unsubscribe real
users. Expect a small `invalid_token` count on every campaign; that is normal churn.

---

## Delivery detail retention

Per-device rows are kept 90 days after a campaign ends; campaign totals are frozen
first (`freeze_campaign_stats`, daily 03:30 UTC) and kept forever, as are the audit
history and taps. The prune (`campaign-delivery-prune`, daily 04:00 UTC) ships
**off** (`campaign_delivery_prune_enabled = 'false'`) and only records what it would
delete (`deliveries_prune_run` audit rows). Turn it on only after checking a week of
those rows once a campaign has actually reached 90 days (the first: 2026-12-21).

---

## Who to tell

- **Wrong content went out to many people:** the owner, immediately; decide on a
  correction message together. Do not send one alone.
- **Credentials failure (`failed` with a credentials code):** the owner — it blocks
  all push, including direct messages, until fixed.
- **Anything suspicious in who could send** (an unexpected campaign, an unknown
  admin in the audit history): turn the kill switch off, then the owner.
